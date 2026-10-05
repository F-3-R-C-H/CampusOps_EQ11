/**
 * UI Screen: CrearIncidencia
 *
 * Formulario de creación de incidencias. Consume el caso de uso
 * CreateIncidencia (application layer); NUNCA importa desde infrastructure/
 * ni llama HTTP directamente.
 *
 * Interfaz de navegación (para App.tsx):
 *   <CrearIncidencia repository={...} onCreated={(id) => ...} onCancel={() => ...} />
 *   `onCreated` se invoca tras un 201 o un replay 200 confirmados: App debe
 *   volver a la lista (que se vuelve a consultar al montarse) o abrir el detalle.
 */

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  CreateIncidencia,
  type IdempotencyKeyGenerator,
} from '../../application/usecases/CreateIncidencia';
import { INCIDENT_CATEGORIES, type NewIncidentField } from '../../domain/models/NewIncident';
import type { IIncidenciaRepository } from '../../domain/ports/IIncidenciaRepository';
import type { IncidentCategory } from '../../campusops/contracts';
import { createIncidentMessage } from '../createIncidentMessage';

const CATEGORY_LABELS: Record<IncidentCategory, string> = {
  electrical: '⚡ Eléctrico',
  laboratory: '🔬 Laboratorio',
  water: '💧 Agua',
  connectivity: '📶 Conectividad',
  equipment: '🖥️ Equipo',
  safety: '🛡️ Seguridad',
  maintenance: '🔧 Mantenimiento',
};

const FIELD_MESSAGES: Record<NewIncidentField, string> = {
  category: 'Selecciona una categoría.',
  description: 'Escribe una descripción.',
  location: 'Escribe la ubicación.',
};

type SubmitState =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'submitting' }>
  | Readonly<{ kind: 'success'; id: string; replayed: boolean }>
  | Readonly<{ kind: 'error'; message: string }>;

type FieldErrors = Readonly<Partial<Record<NewIncidentField, string>>>;

interface Props {
  repository: IIncidenciaRepository;
  onCreated: (incidentId: string) => void;
  onCancel: () => void;
  /** Sólo para pruebas deterministas; por defecto se genera una clave única por operación. */
  generateKey?: IdempotencyKeyGenerator;
}

export function CrearIncidencia({ repository, onCreated, onCancel, generateKey }: Props) {
  // El caso de uso conserva la clave de idempotencia entre reintentos.
  const [useCase] = useState(() => new CreateIncidencia(repository, generateKey));
  const [category, setCategory] = useState<IncidentCategory | null>(null);
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submit, setSubmit] = useState<SubmitState>({ kind: 'idle' });
  const [pendingOperation, setPendingOperation] = useState(false);
  const submitting = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Con una operación incierta pendiente el contenido se bloquea: editarlo
  // crearía una operación distinta y podría duplicar la incidencia ya guardada.
  const locked = pendingOperation && submit.kind === 'error';
  const busy = submit.kind === 'submitting';

  const send = async () => {
    if (submitting.current) return; // evita envíos simultáneos de la misma operación
    submitting.current = true;
    setFieldErrors({});
    setSubmit({ kind: 'submitting' });
    try {
      const result = await useCase.submit({ category, description, location });
      if (!mounted.current) return;
      setPendingOperation(useCase.hasPendingOperation);

      if (result.ok) {
        setSubmit({ kind: 'success', id: result.incident.id, replayed: result.kind === 'replayed' });
        onCreated(result.incident.id);
        return;
      }
      if (result.error.kind === 'validation') {
        const errors: Partial<Record<NewIncidentField, string>> = {};
        for (const field of result.error.fields) errors[field] = FIELD_MESSAGES[field];
        setFieldErrors(errors);
      }
      setSubmit({ kind: 'error', message: createIncidentMessage(result.error) });
    } catch {
      if (!mounted.current) return;
      setPendingOperation(useCase.hasPendingOperation);
      setSubmit({ kind: 'error', message: 'No fue posible completar el envío.' });
    } finally {
      submitting.current = false;
    }
  };

  const discard = () => {
    useCase.discardPending();
    setPendingOperation(false);
    setSubmit({ kind: 'idle' });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.header}>Nueva incidencia</Text>

      <Text style={styles.label}>Categoría</Text>
      <View style={styles.chips}>
        {INCIDENT_CATEGORIES.map((value) => {
          const selected = category === value;
          return (
            <Pressable
              key={value}
              testID={`categoria-${value}`}
              disabled={locked || busy}
              onPress={() => setCategory(value)}
              accessibilityState={{ selected, disabled: locked || busy }}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={selected ? styles.chipTextSelected : styles.chipText}>{CATEGORY_LABELS[value]}</Text>
            </Pressable>
          );
        })}
      </View>
      {fieldErrors.category ? <Text style={styles.fieldError} testID="error-categoria">{fieldErrors.category}</Text> : null}

      <Text style={styles.label}>Descripción</Text>
      <TextInput
        testID="input-descripcion"
        style={styles.input}
        value={description}
        onChangeText={setDescription}
        editable={!locked && !busy}
        multiline
        placeholder="¿Qué ocurre?"
      />
      {fieldErrors.description ? <Text style={styles.fieldError} testID="error-descripcion">{fieldErrors.description}</Text> : null}

      <Text style={styles.label}>Ubicación</Text>
      <TextInput
        testID="input-ubicacion"
        style={styles.input}
        value={location}
        onChangeText={setLocation}
        editable={!locked && !busy}
        placeholder="Edificio, piso, área"
      />
      {fieldErrors.location ? <Text style={styles.fieldError} testID="error-ubicacion">{fieldErrors.location}</Text> : null}

      {submit.kind === 'error' ? (
        <Text style={styles.errorText} testID={pendingOperation ? 'crear-incierto' : 'crear-error'}>
          {submit.message}
        </Text>
      ) : null}
      {submit.kind === 'success' ? (
        <Text style={styles.successText} testID="crear-exito">
          {submit.replayed
            ? `La incidencia ${submit.id} ya estaba registrada; no se duplicó.`
            : `Incidencia ${submit.id} creada.`}
        </Text>
      ) : null}

      <Pressable
        testID="crear-enviar"
        style={[styles.primaryButton, busy && styles.buttonDisabled]}
        disabled={busy}
        onPress={send}
        accessibilityState={{ disabled: busy }}
      >
        {busy ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.primaryText}>{locked ? 'Reintentar envío' : 'Crear incidencia'}</Text>
        )}
      </Pressable>

      {locked ? (
        <Pressable testID="crear-descartar" style={styles.secondaryButton} disabled={busy} onPress={discard}>
          <Text style={styles.secondaryText}>Descartar envío</Text>
        </Pressable>
      ) : null}
      <Pressable testID="crear-cancelar" style={styles.secondaryButton} disabled={busy} onPress={onCancel}>
        <Text style={styles.secondaryText}>Cancelar</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16 },
  header: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 12, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#BDBDBD', paddingHorizontal: 12, paddingVertical: 6 },
  chipSelected: { backgroundColor: '#1976D2', borderColor: '#1976D2' },
  chipText: { color: '#333', fontSize: 13 },
  chipTextSelected: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  input: { backgroundColor: '#FFF', borderRadius: 8, borderWidth: 1, borderColor: '#BDBDBD', padding: 10, fontSize: 15 },
  fieldError: { color: '#B00020', fontSize: 12, marginTop: 4 },
  errorText: { color: '#B00020', fontSize: 14, marginTop: 14 },
  successText: { color: '#2E7D32', fontSize: 14, marginTop: 14 },
  primaryButton: { backgroundColor: '#1976D2', borderRadius: 6, paddingVertical: 12, alignItems: 'center', marginTop: 18 },
  buttonDisabled: { opacity: 0.6 },
  primaryText: { color: '#FFF', fontWeight: '600' },
  secondaryButton: { borderRadius: 6, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  secondaryText: { color: '#1976D2', fontWeight: '600' },
});

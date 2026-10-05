/**
 * UI Screen: DetalleIncidencia
 *
 * Pantalla que muestra el detalle completo de una incidencia.
 * Consume el caso de uso GetIncidencias (application layer),
 * NUNCA importa directamente desde infrastructure/.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import type { Incidencia } from '../../domain/models/Incidencia';
import { GetIncidencias } from '../../application/usecases/GetIncidencias';
import type { IIncidenciaRepository } from '../../domain/ports/IIncidenciaRepository';
import { incidentQueryMessage } from '../incidentQueryMessage';

type DetailState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'data'; incident: Incidencia }>
  | Readonly<{ kind: 'payload_absent'; id: string }>
  | Readonly<{ kind: 'error'; message: string }>;

const STATUS_LABELS: Record<string, string> = {
  open: 'Abierta',
  assigned: 'Asignada',
  in_progress: 'En proceso',
  resolved: 'Resuelta',
  closed: 'Cerrada',
};

const STATUS_COLORS: Record<string, string> = {
  open: '#F44336',
  assigned: '#FF9800',
  in_progress: '#2196F3',
  resolved: '#4CAF50',
  closed: '#9E9E9E',
};

const CATEGORY_LABELS: Record<string, string> = {
  electrical: '⚡ Eléctrico',
  laboratory: '🔬 Laboratorio',
  water: '💧 Agua',
  connectivity: '📶 Conectividad',
  equipment: '🖥️ Equipo',
  safety: '🛡️ Seguridad',
  maintenance: '🔧 Mantenimiento',
};

interface Props {
  repository: IIncidenciaRepository;
  incidenciaId: string;
  onBack: () => void;
}

export function DetalleIncidencia({ repository, incidenciaId, onBack }: Props) {
  const [state, setState] = useState<DetailState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const activeRequest = useRef(0);
  const loadData = useCallback(() => {
    const useCase = new GetIncidencias(repository);
    return useCase.executeById(incidenciaId);
  }, [incidenciaId, repository]);
  const retry = () => {
    setState({ kind: 'loading' });
    setAttempt((value) => value + 1);
  };

  useEffect(() => {
    const requestId = ++activeRequest.current;
    loadData()
      .then((result) => {
        if (activeRequest.current !== requestId) return;
        if (!result.ok) {
          setState({ kind: 'error', message: incidentQueryMessage(result.error) });
        } else if (result.kind === 'payload_absent') {
          setState({ kind: 'payload_absent', id: result.resource.id });
        } else {
          setState({ kind: 'data', incident: result.incident });
        }
      })
      .catch(() => {
        if (activeRequest.current === requestId) {
          setState({ kind: 'error', message: 'No fue posible completar la consulta.' });
        }
      });
    return () => {
      if (activeRequest.current === requestId) activeRequest.current += 1;
    };
  }, [attempt, loadData]);

  if (state.kind === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  if (state.kind === 'error' || state.kind === 'payload_absent') {
    return (
      <View style={styles.center} testID={state.kind === 'error' ? 'detalle-error' : 'detalle-payload-ausente'}>
        <Text style={styles.errorText}>
          {state.kind === 'error' ? state.message : `La incidencia ${state.id} no tiene datos disponibles.`}
        </Text>
        <Pressable style={styles.retryButton} onPress={retry}>
          <Text style={styles.retryText}>Reintentar</Text>
        </Pressable>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Volver a la lista</Text>
        </Pressable>
      </View>
    );
  }

  const incidencia = state.incident;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable style={styles.backButton} onPress={onBack}>
        <Text style={styles.backButtonText}>← Volver a la lista</Text>
      </Pressable>

      <View style={styles.headerRow}>
        <Text style={styles.id}>{incidencia.id}</Text>
        <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[incidencia.status] ?? '#9E9E9E' }]}>
          <Text style={styles.statusText}>{STATUS_LABELS[incidencia.status] ?? incidencia.status}</Text>
        </View>
      </View>

      <Text style={styles.title}>{incidencia.title ?? incidencia.description}</Text>
      <Text style={styles.category}>{CATEGORY_LABELS[incidencia.category] ?? incidencia.category}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Descripción</Text>
        <Text style={styles.description}>{incidencia.description}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ubicación</Text>
        <Text style={styles.info}>📍 {incidencia.location}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Detalles</Text>
        <View style={styles.detailRow}>
          <Text style={styles.label}>Reportado por:</Text>
          <Text style={styles.value}>{incidencia.reporterId}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.label}>Técnico asignado:</Text>
          <Text style={styles.value}>{incidencia.assignedTechnicianId ?? 'Sin asignar'}</Text>
        </View>
        {incidencia.createdAt ? (
          <View style={styles.detailRow}>
            <Text style={styles.label}>Fecha de creación:</Text>
            <Text style={styles.value}>{new Date(incidencia.createdAt).toLocaleString('es-MX')}</Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { fontSize: 16, color: '#F44336', marginBottom: 16 },
  retryButton: { backgroundColor: '#1976D2', borderRadius: 6, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 16 },
  retryText: { color: '#FFF', fontWeight: '600' },
  backButton: { marginBottom: 16 },
  backButtonText: { fontSize: 14, color: '#1976D2', fontWeight: '600' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  id: { fontSize: 14, color: '#999', fontWeight: '600' },
  statusBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  title: { fontSize: 20, fontWeight: '700', color: '#333', marginBottom: 4 },
  category: { fontSize: 14, color: '#666', marginBottom: 16 },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#1976D2', marginBottom: 8, textTransform: 'uppercase' },
  description: { fontSize: 14, color: '#444', lineHeight: 20 },
  info: { fontSize: 14, color: '#444' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  label: { fontSize: 13, color: '#888' },
  value: { fontSize: 13, color: '#333', fontWeight: '500' },
});

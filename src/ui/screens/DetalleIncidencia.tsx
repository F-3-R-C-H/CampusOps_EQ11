/**
 * UI Screen: DetalleIncidencia
 *
 * Pantalla que muestra el detalle completo de una incidencia.
 * Consume el caso de uso GetIncidencias (application layer),
 * NUNCA importa directamente desde infrastructure/.
 */

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import type { Incidencia } from '../../domain/models/Incidencia';
import { GetIncidencias } from '../../application/usecases/GetIncidencias';
import type { IIncidenciaRepository } from '../../domain/ports/IIncidenciaRepository';

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
  const [incidencia, setIncidencia] = useState<Incidencia | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const useCase = new GetIncidencias(repository);
    useCase.executeById(incidenciaId).then((data) => {
      if (active) {
        setIncidencia(data);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [repository, incidenciaId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  if (!incidencia) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Incidencia no encontrada</Text>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Volver a la lista</Text>
        </Pressable>
      </View>
    );
  }

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

      <Text style={styles.title}>{incidencia.title}</Text>
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
        <View style={styles.detailRow}>
          <Text style={styles.label}>Fecha de creación:</Text>
          <Text style={styles.value}>{new Date(incidencia.createdAt).toLocaleString('es-MX')}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { fontSize: 16, color: '#F44336', marginBottom: 16 },
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

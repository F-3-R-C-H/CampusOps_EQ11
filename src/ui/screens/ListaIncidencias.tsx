/**
 * UI Screen: ListaIncidencias
 *
 * Pantalla que muestra la lista de incidencias del campus.
 * Consume el caso de uso GetIncidencias (application layer),
 * NUNCA importa directamente desde infrastructure/.
 */

import { useEffect, useState, useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
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
  onSelectIncidencia: (id: string) => void;
}

export function ListaIncidencias({ repository, onSelectIncidencia }: Props) {
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const useCase = new GetIncidencias(repository);
    const data = await useCase.execute();
    setIncidencias(data);
    setLoading(false);
  }, [repository]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1976D2" />
        <Text style={styles.loadingText}>Cargando incidencias...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Incidencias del Campus</Text>
      <Text style={styles.subtitle}>{incidencias.length} incidencia(s) registrada(s)</Text>
      <FlatList
        data={incidencias}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => onSelectIncidencia(item.id)}
            testID={`incidencia-${item.id}`}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardId}>{item.id}</Text>
              <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] ?? '#9E9E9E' }]}>
                <Text style={styles.statusText}>{STATUS_LABELS[item.status] ?? item.status}</Text>
              </View>
            </View>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardCategory}>{CATEGORY_LABELS[item.category] ?? item.category}</Text>
            <Text style={styles.cardLocation}>📍 {item.location}</Text>
          </Pressable>
        )}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#666', fontSize: 14 },
  header: { fontSize: 22, fontWeight: '700', paddingHorizontal: 16, paddingTop: 16 },
  subtitle: { fontSize: 13, color: '#888', paddingHorizontal: 16, paddingBottom: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardId: { fontSize: 12, color: '#999', fontWeight: '600' },
  statusBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { color: '#FFF', fontSize: 11, fontWeight: '600' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 4 },
  cardCategory: { fontSize: 13, color: '#666', marginBottom: 2 },
  cardLocation: { fontSize: 12, color: '#888' },
});

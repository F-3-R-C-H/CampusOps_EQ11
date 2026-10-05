/**
 * App.tsx — Punto de entrada de CampusOps
 *
 * La inyección de dependencias ocurre aquí: App crea el repositorio concreto
 * (IncidenciaApiRepository) y lo pasa a las pantallas de UI.
 * Las pantallas NUNCA importan directamente desde infrastructure/.
 */

import { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { getBackendHealth } from './src/api/courseBackend';
import { getCourseActor, getCourseBackendBaseUrl, getCourseScenario } from './src/config/courseBackend';
import { IncidenciaApiRepository } from './src/infrastructure/api/IncidenciaApiRepository';
import { CourseHttpClient } from './src/infrastructure/http/CourseHttpClient';
import type { IIncidenciaRepository } from './src/domain/ports/IIncidenciaRepository';
import { ListaIncidencias } from './src/ui/screens/ListaIncidencias';
import { DetalleIncidencia } from './src/ui/screens/DetalleIncidencia';

// Inyección de dependencias: se crea la implementación concreta aquí
// y se pasa como contrato a las pantallas de UI.
const baseUrl = getCourseBackendBaseUrl();
const scenario = getCourseScenario();
const httpClient = new CourseHttpClient({
  baseUrl,
  actorId: getCourseActor(),
  ...(scenario ? { scenario } : {}),
});
const defaultRepository = new IncidenciaApiRepository(httpClient);

type AppProps = Readonly<{ repository?: IIncidenciaRepository }>;

export default function App({ repository = defaultRepository }: AppProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'available' | 'offline'>('checking');

  useEffect(() => {
    let active = true;
    getBackendHealth(baseUrl)
      .then(() => active && setBackendStatus('available'))
      .catch(() => active && setBackendStatus('offline'));
    return () => { active = false; };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <View style={styles.header}>
        <Text style={styles.title}>CampusOps</Text>
        <Text testID="backend-status">Backend: {backendStatus}</Text>
      </View>
      {selectedId ? (
        <DetalleIncidencia
          repository={repository}
          incidenciaId={selectedId}
          onBack={() => setSelectedId(null)}
        />
      ) : (
        <ListaIncidencias
          repository={repository}
          onSelectIncidencia={setSelectedId}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '700', color: '#1976D2' },
});

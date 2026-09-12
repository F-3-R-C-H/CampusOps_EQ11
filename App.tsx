/**
 * App.tsx — Punto de entrada de CampusOps
 *
 * La inyección de dependencias ocurre aquí: App crea el repositorio concreto
 * (IncidenciaMemoryRepo) y lo pasa a las pantallas de UI.
 * Las pantallas NUNCA importan directamente desde infrastructure/.
 */

import { useState } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { IncidenciaMemoryRepo } from './src/infrastructure/memory/IncidenciaMemoryRepo';
import { ListaIncidencias } from './src/ui/screens/ListaIncidencias';
import { DetalleIncidencia } from './src/ui/screens/DetalleIncidencia';

// Inyección de dependencias: se crea la implementación concreta aquí
// y se pasa como contrato a las pantallas de UI.
const repository = new IncidenciaMemoryRepo();

export default function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
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
});

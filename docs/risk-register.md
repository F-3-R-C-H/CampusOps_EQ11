# Registro de Riesgos — CampusOps

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| **Caída del backend en periodo de alta demanda** | Media | Alto | Implementar reintentos automáticos con backoff exponencial, uso de balanceador de carga y escalabilidad automática en la nube. |
| **Datos de usuario expuestos** | Baja | Crítico | Validación estricta, sanitización de inputs y cifrado de datos sensibles en tránsito y en reposo (HTTPS, encriptación en BD). |
| **Error de sincronización de estado offline** | Alta | Medio | Manejo de estado local temporal y algoritmos de resolución de conflictos al reconectar con el servidor. |

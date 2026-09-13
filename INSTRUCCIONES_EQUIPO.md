# 📌 Instrucciones para el Equipo (Semana 01) - CampusOps EQ11

¡Hola Danna y Tonantzin!

Ya he subido a la rama `dev` los archivos base (plantillas) para nuestra entrega de la Semana 01. 

⚠️ **Muy importante:** La rúbrica del profesor exige que **cada integrante del equipo tenga commits propios con su propio usuario de Git** (nombre y correo), y que coloquemos los ID de esos commits (SHA) en nuestro reporte de evidencias.

Por favor, sigan estos pasos exactos desde sus computadoras:

---

## ⚙️ Paso 1: Bajar los cambios a su computadora
Abran la terminal en la carpeta del proyecto (`CampusOps_EQ11`) y asegúrense de estar en la rama correcta ejecutando:
```bash
git fetch origin
git checkout dev
git pull origin dev
```

---

## 👧 Tareas para Danna
1. Abre el archivo `docs/risk-register.md`. Eres la encargada principal de revisarlo. Si gustas, puedes ajustar los 3 riesgos que ya están redactados o dejarlos como están.
2. Abre el archivo `evidence/week-01/individual.json`.
3. Busca la sección que te corresponde y cambia `"studentId": "REEMPLAZAR_MATRICULA_DANNA"` por tu **matrícula real**.
4. Abre tu terminal y obtén el SHA actual de tu repositorio (el ID de tu trabajo actual) ejecutando:
   ```bash
   git rev-parse HEAD
   ```
5. Pega ese código (es una cadena larga de 40 letras y números) donde dice `"REEMPLAZAR_AQUI_CON_SHA_DE_DANNA"`.
6. Guarda los archivos, haz tu propio commit y súbelo a GitHub:
   ```bash
   git add .
   git commit -m "docs: actualizar registro de riesgos y agregar mis datos"
   git push origin dev
   ```

---

## 👧 Tareas para Tonantzin
1. Abre el archivo `evidence/week-01/engineering.json`. Eres la encargada de la justificación técnica de por qué dejamos la estructura del repositorio en la raíz. Revísala y asegúrate de que estás de acuerdo con el *tradeoff*.
2. Abre el archivo `evidence/week-01/individual.json`.
3. Busca la sección que te corresponde y cambia `"studentId": "REEMPLAZAR_MATRICULA_TONANTZIN"` por tu **matrícula real**.
4. Abre tu terminal y obtén el SHA actual ejecutando:
   ```bash
   git rev-parse HEAD
   ```
5. Pega ese código (40 letras y números) donde dice `"REEMPLAZAR_AQUI_CON_SHA_DE_TONANTZIN"`.
6. Guarda los archivos, haz tu commit y súbelo a GitHub:
   ```bash
   git add .
   git commit -m "docs: revisar decision de ingenieria y agregar mis datos"
   git push origin dev
   ```

---

## 🚨 Nota final para ambas
Si al momento de hacer `git push` les marca un error que dice *"updates were rejected because the remote contains work that you do not have locally"*, no se asusten. Esto pasa si otra integrante subió sus cambios antes que tú. 

Para solucionarlo, solo hagan:
```bash
git pull origin dev
```
(Resuelvan posibles conflictos si salen, y cierren el editor de texto que abre git)
Y luego vuelvan a intentar el push:
```bash
git push origin dev
```

¡Cualquier duda me avisan!

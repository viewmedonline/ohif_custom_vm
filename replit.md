# Ejecutar ViewMed en Replit

El proyecto tiene dos procesos necesarios: el visor OHIF y el proxy Nginx de caché
DICOM. Iniciar el workflow web con `bash .scripts/dev-replit.sh`: prepara y arranca
Nginx en el puerto 8080, espera su respuesta y luego arranca el visor en el puerto
5000. Al detener el workflow se detiene también el proxy.

Flujo de peticiones: navegador → `/pacs` en el mismo origen del visor →
proxy Nginx → PACS de desarrollo `https://pacs.viewmed-services.com`
(`dcm4chee-arc/aets/VIEWMED`). La dirección `/dcm4chee-arc/ui2` es la interfaz del
PACS, no la ruta DICOMweb. La configuración del visor está en
`platform/app/public/config/viewmed.js`; el proxy y sus reglas de caché están en
`proxy/nginx.conf`. El script adapta esa misma configuración de Nginx a las rutas
locales de Replit; no usa Docker.

Para ejecutar localmente con Docker, `docker compose up --build` inicia ambos
servicios. El contenedor del visor reenvía `/pacs` al contenedor del proxy.
El volumen `nginx-cache` conserva la caché entre reinicios de Docker; en Replit,
la caché se guarda en `.cache/nginx/` (sin garantía de persistencia al recrear
el entorno). Se necesitan Node.js 20, Yarn y Nginx.

`curl http://127.0.0.1:8080/health` confirma solo que el proxy está activo.
`curl -i 'http://127.0.0.1:5000/pacs/aets/VIEWMED/rs/studies?limit=1'`
comprueba la cadena completa y permite ver `X-Cache-Status` en la respuesta.
No cargues datos clínicos reales en una vista previa pública sin controlar antes
el acceso al PACS y al proyecto.
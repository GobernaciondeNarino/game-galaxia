#!/usr/bin/env bash
# ============================================================================
#  ORBIS — Rastreo de credenciales.
#
#  Dos pasadas, porque hay dos peligros distintos y una sola regla los confunde:
#
#    1. UNA CREDENCIAL EN ALGO QUE EL NAVEGADOR DESCARGA. HTML, JS, CSS o JSON:
#       su contenido viaja entero y cualquiera lo lee. Aquí basta con que
#       aparezca el NOMBRE de una cabecera de autenticación para sospechar: en
#       un archivo estático no pinta nada.
#
#    2. UNA CREDENCIAL ESCRITA A MANO EN EL BACKEND. Un .php NO se sirve —lo
#       ejecuta el servidor— así que `'xi-api-key: ' . $clave` ahí es
#       exactamente lo correcto y marcarlo es ruido. Lo que no puede haber es el
#       VALOR de una clave.
#
#  Se separó tras un falso positivo real: al añadir wj-admin a la primera lista,
#  el rastreo marcó la línea que monta la cabecera en wj-admin/probar-voz.php.
#  Meter PHP en la pasada de estáticos hacía saltar la alarma por código
#  correcto, y una alarma que salta sin motivo se acaba ignorando.
#
#  Se ejecuta en CI y conviene lanzarlo a mano antes de cada despliegue.
# ============================================================================
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

# ---------------------------------------------------------------------------
# 1. Lo que el navegador descarga tal cual.
#    wj-includes/externos son copias íntegras de terceros y las fuentes son
#    binarios: se excluyen para no generar ruido.
# ---------------------------------------------------------------------------
ESTATICOS=(index.html wj-includes/js wj-includes/css wj-content/data wj-content/assets/orbis.svg)

# El nombre de la cabecera cuenta como sospecha aquí, no en el backend.
PATRONES_ESTATICOS='sk_[A-Za-z0-9]{24,}|sk-ant-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xi-api-key|AIza[0-9A-Za-z_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----'

echo "▸ Estáticos que descarga el navegador: ${ESTATICOS[*]}"
if grep -rEIn --exclude-dir=fonts "$PATRONES_ESTATICOS" "${ESTATICOS[@]}" 2>/dev/null; then
  echo
  echo "✘ Algo que parece una credencial en un archivo que se sirve al navegador."
  echo "  Muévelo a wj-config.php o a una variable de entorno de Plesk, y ROTA la"
  echo "  clave: ya está comprometida."
  exit 1
fi

# También el CSS del panel, que sí se sirve. Su .php no: lo ejecuta el servidor.
if grep -rEIn "$PATRONES_ESTATICOS" wj-admin --include='*.css' --include='*.js' --include='*.html' 2>/dev/null; then
  echo
  echo "✘ Algo que parece una credencial en un estático de wj-admin."
  exit 1
fi

# ---------------------------------------------------------------------------
# 2. El backend: aquí lo que no puede haber es el VALOR de una clave.
#    Se busca la forma de las claves reales, nunca el nombre de una cabecera.
# ---------------------------------------------------------------------------
PATRONES_BACKEND='sk_[A-Za-z0-9]{24,}|sk-ant-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AIza[0-9A-Za-z_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----'

echo "▸ Backend: wj-includes wj-admin tools (sin dependencias de terceros)"
if grep -rEIn --exclude-dir=vendor "$PATRONES_BACKEND" wj-includes wj-admin tools 2>/dev/null; then
  echo
  echo "✘ Hay una clave escrita a mano en el código del servidor. Sácala a"
  echo "  wj-config.php o a una variable de entorno, y RÓTALA."
  exit 1
fi

# ---------------------------------------------------------------------------
# 3. Los archivos que nunca deben estar versionados.
# ---------------------------------------------------------------------------
for prohibido in wj-config.php wj-content/ajustes/ajustes.json; do
  if git ls-files --error-unmatch "$prohibido" >/dev/null 2>&1; then
    echo "✘ $prohibido está versionado en git. Sácalo del índice:"
    echo "     git rm --cached $prohibido"
    exit 1
  fi
done

echo "✔ Sin credenciales en lo que se sirve ni escritas en el backend."

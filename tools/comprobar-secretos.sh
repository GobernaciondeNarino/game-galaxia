#!/usr/bin/env bash
# Busca credenciales en todo lo que el navegador puede descargar.
# Se ejecuta en CI y conviene lanzarlo a mano antes de cada despliegue.
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

# Rutas realmente servidas como estáticos (vendor/ son copias íntegras de
# terceros y assets/fonts son binarios: se excluyen para no generar ruido).
RUTAS=(index.html js css data assets/orbis.svg)

# Patrones de credencial. sk_… es el formato de las claves de ElevenLabs;
# sk-ant-… el de Anthropic; ghp_/github_pat_ los tokens de GitHub.
PATRONES='sk_[A-Za-z0-9]{24,}|sk-ant-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xi-api-key|AIza[0-9A-Za-z_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----'

echo "▸ Buscando credenciales en: ${RUTAS[*]}"
if grep -rEIn --exclude-dir=fonts "$PATRONES" "${RUTAS[@]}" 2>/dev/null; then
  echo
  echo "✘ Se ha encontrado algo que parece una credencial en un archivo que se"
  echo "  sirve al navegador. Muévelo a config/secrets.php o a una variable de"
  echo "  entorno de Plesk y ROTA la clave: ya está comprometida."
  exit 1
fi

# config/secrets.php nunca debe estar versionado.
if git ls-files --error-unmatch config/secrets.php >/dev/null 2>&1; then
  echo "✘ config/secrets.php está versionado en git. Elimínalo del índice:"
  echo "     git rm --cached config/secrets.php"
  exit 1
fi

echo "✔ Sin credenciales en los archivos servidos al navegador."

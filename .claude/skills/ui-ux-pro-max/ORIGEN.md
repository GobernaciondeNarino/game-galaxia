# Origen de esta skill

Instalada desde <https://github.com/nextlevelbuilder/ui-ux-pro-max-skill> (v2.13.0, MIT).

Se ha vendorizado dentro del repositorio, en lugar de instalarla como plugin de
usuario, para que cualquiera que clone ORBIS trabaje con las mismas guías de
diseño: la HUD de este proyecto debe mantener una coherencia visual estricta
entre fases y entre personas.

- Solo se ha copiado la skill `ui-ux-pro-max` (la que da nombre al repositorio).
  El repositorio de origen incluye además `design`, `design-system`, `brand`,
  `ui-styling`, `banner-design` y `slides`, que ORBIS no necesita.
- Se ha excluido `scripts/tests/` (fixtures de desarrollo de la propia skill).

Para actualizarla:

```bash
git clone --depth 1 https://github.com/nextlevelbuilder/ui-ux-pro-max-skill /tmp/uiux
rm -rf .claude/skills/ui-ux-pro-max
cp -r /tmp/uiux/.claude/skills/ui-ux-pro-max .claude/skills/
rm -rf .claude/skills/ui-ux-pro-max/scripts/tests
```

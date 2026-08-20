/**
 * Preferencias de sesión — EN MEMORIA.
 *
 * Requisito explícito del proyecto: no se usa localStorage ni sessionStorage.
 * Las preferencias viven mientras dure la pestaña y desaparecen al cerrarla,
 * lo que además evita cualquier rastro persistente del usuario en el equipo.
 */

const PREDETERMINADAS = Object.freeze({
  escala: 'didactico',        // 'didactico' | 'real'
  mostrarOrbitas: true,
  velocidadTiempo: 1,         // 0 (pausa), 1, 100, 10000, 1000000
  volumenNarracion: 0.85,
  narracionSilenciada: false,
  subtitulos: true,
  camaraActiva: false,
  microfonoActivo: false,
  calidad: 'auto',            // 'auto' | 'alta' | 'media' | 'baja'
});

const valores = { ...PREDETERMINADAS };
const suscriptores = new Set();

export const preferencias = {
  get(clave) {
    return valores[clave];
  },

  set(clave, valor) {
    if (!(clave in PREDETERMINADAS)) {
      throw new Error(`Preferencia desconocida: ${clave}`);
    }
    if (valores[clave] === valor) return valor;
    const anterior = valores[clave];
    valores[clave] = valor;
    for (const fn of suscriptores) fn(clave, valor, anterior);
    return valor;
  },

  todas() {
    return { ...valores };
  },

  restablecer() {
    Object.assign(valores, PREDETERMINADAS);
    for (const fn of suscriptores) fn(null, null, null);
  },

  /** Devuelve la función para cancelar la suscripción. */
  alCambiar(fn) {
    suscriptores.add(fn);
    return () => suscriptores.delete(fn);
  },
};

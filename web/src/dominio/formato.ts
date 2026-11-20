/** Números e identificadores em pt-PT, como no desenho («0,36», «−0,13», «SC0020»). */

const MENOS = "−";

export function numero(valor: number, casas = 0): string {
  const texto = new Intl.NumberFormat("pt-PT", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(valor);
  return texto.replace("-", MENOS);
}

/** Efeito com sinal explícito: «+0,02», «−0,21». */
export function comSinal(valor: number, casas = 2): string {
  const texto = numero(valor, casas);
  return valor > 0 ? `+${texto}` : texto;
}

/** Intervalo de percentagens arredondadas: «23–24 %» (ou «23 %» se coincidirem). */
export function intervaloPct(min: number, max: number): string {
  const a = Math.round(min);
  const b = Math.round(max);
  return a === b ? `${a} %` : `${a}–${b} %`;
}

export function urn(id: string): string {
  return id.startsWith("urn:ngsi-ld:") ? id : `urn:ngsi-ld:${id}`;
}

/** Rótulo curto de um sensor: SmartCrosswalk:0020 → SC0020, RoadSideUnit:0030 → RSU0030, RoadSegment:11165 → 11165. */
export function rotuloSensor(id: string): string {
  const [tipo, num] = id.replace("urn:ngsi-ld:", "").split(":");
  switch (tipo) {
    case "SmartCrosswalk":
      return `SC${num}`;
    case "RoadSideUnit":
      return `RSU${num}`;
    case "TouristZone":
      return `TZ${num}`;
    default:
      return num ?? id;
  }
}

/** «SC0019–0022» para uma lista seguida do mesmo tipo; senão, a lista separada por vírgulas. */
export function rotuloLista(ids: string[]): string {
  const rotulos = ids.map(rotuloSensor).sort();
  if (rotulos.length < 3) return rotulos.join(" e ");
  const prefixo = rotulos[0].replace(/\d+$/, "");
  const nums = rotulos.map((r) => r.slice(prefixo.length));
  const seguidos = nums.every((n, i) => i === 0 || Number(n) === Number(nums[i - 1]) + 1);
  if (seguidos && rotulos.every((r) => r.startsWith(prefixo))) return `${rotulos[0]}–${nums[nums.length - 1]}`;
  return `${rotulos.slice(0, -1).join(", ")} e ${rotulos[rotulos.length - 1]}`;
}

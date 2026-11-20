/** Onde cada passadeira corta cada segmento, para os carros e os peões da vista 3D não se cruzarem (ADR-0043, `cena3d.ts`). */
import type { SegmentoCarros } from "./carros";
import type { Passadeira3D } from "./peoes";

/** Uma passadeira corta o segmento se o centro dela ficar a menos de meia travessia + isto da linha (m). */
const FOLGA_CORTE_M = 2;

/** Onde uma passadeira corta um segmento: a distância ao início (m) e meia largura da passadeira no sentido do trânsito. */
export interface Corte {
  id: string;
  d: number;
  meia: number;
}

const M_POR_GRAU_LAT = 110_574;

/** As passadeiras que cada segmento atravessa, com a distância de cada uma ao início do segmento. */
export function cortesDosSegmentos(segmentos: SegmentoCarros[], passadeiras: Passadeira3D[]): Map<string, Corte[]> {
  const cortes = new Map<string, Corte[]>();
  for (const p of passadeiras) {
    const [lon0, lat0] = p.ponto(0, 0);
    const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
    for (const s of segmentos) {
      // O ponto da linha mais perto do centro da passadeira, em metros à volta do centro.
      let melhor = { dist: Infinity, d: 0 };
      for (let i = 1; i < s.linha.length; i++) {
        const [ax, ay] = [(s.linha[i - 1][0] - lon0) * kx, (s.linha[i - 1][1] - lat0) * M_POR_GRAU_LAT];
        const [bx, by] = [(s.linha[i][0] - lon0) * kx, (s.linha[i][1] - lat0) * M_POR_GRAU_LAT];
        const [dx, dy] = [bx - ax, by - ay];
        const l2 = dx * dx + dy * dy;
        const f = l2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
        const dist = Math.hypot(ax + f * dx, ay + f * dy);
        if (dist < melhor.dist) melhor = { dist, d: s.acumulado[i - 1] + f * (s.acumulado[i] - s.acumulado[i - 1]) };
      }
      if (melhor.dist > p.L / 2 + FOLGA_CORTE_M) continue;
      cortes.set(s.id, [...(cortes.get(s.id) ?? []), { id: p.id, d: melhor.d, meia: p.S / 2 }]);
    }
  }
  return cortes;
}

/** Os semáforos e os sinais H7 nas pontas das passadeiras (vista 3D). */
import { describe, expect, it } from "vitest";
import type { PassadeiraMapa } from "../api/tipos";
import { mobiliarioDasPassadeiras } from "./passadeiras";

const LAT0 = 40.636, LON0 = -8.6467;
const M_LAT = 111_320, M_LON = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
// uma passadeira de 10 m (oeste-este, a travessia) por 4 m (norte-sul, o sentido do trânsito)
const ret = (id: string): PassadeiraMapa => ({
  type: "Feature",
  properties: { id },
  geometry: {
    type: "Polygon",
    coordinates: [[[-5, -2], [5, -2], [5, 2], [-5, 2], [-5, -2]].map(([x, y]) => [LON0 + x / M_LON, LAT0 + y / M_LAT])],
  },
} as PassadeiraMapa);
const metros = ([lon, lat]: [number, number]) => [Math.round((lon - LON0) * M_LON * 10) / 10, Math.round((lat - LAT0) * M_LAT * 10) / 10];

describe("mobiliarioDasPassadeiras", () => {
  it("põe um em cada ponta, no passeio e do lado de onde vem o trânsito, virado para ele", () => {
    const m = mobiliarioDasPassadeiras([ret("a"), ret("b"), ret("c")], new Set(["a"]), new Set(["b", "a"]));
    expect(m.filter((x) => x.id === "a").every((x) => x.tipo !== "sinal_h7")).toBe(true); // o semáforo ganha ao H7
    expect(m.filter((x) => x.id === "b").every((x) => x.tipo === "sinal_h7")).toBe(true);
    expect(m.some((x) => x.id === "c")).toBe(false);
    const pontas = m.filter((x) => x.id === "b").map((x) => ({ onde: metros(x.coord), rumo: Math.round(x.rumo) }));
    // a ponta este: os carros junto a ela vão para norte, vêm do sul; o sinal fica a sul e virado para sul (180°)
    // a ponta oeste: os carros vão para sul, vêm do norte; o sinal fica a norte e virado para norte (0°)
    expect(pontas).toEqual(expect.arrayContaining([{ onde: [5.6, -2.5], rumo: 180 }, { onde: [-5.6, 2.5], rumo: 0 }]));
    expect(pontas).toHaveLength(2);
  });

  it("numa passadeira com semáforo: o de braço na ponta este e um poste de peões na oeste, com os rumos opostos", () => {
    const m = mobiliarioDasPassadeiras([ret("a")], new Set(["a"]), new Set());
    const so = (tipo: string) => m.filter((x) => x.tipo === tipo).map((x) => ({ onde: metros(x.coord), rumo: Math.round(x.rumo) }));
    expect(m).toHaveLength(2);
    // o semáforo de braço, um só (cobre a via toda), na ponta este; o poste de peões na oeste, virado ao contrário: a sua
    // cabeça (para -X do modelo) olha para a ponta este, para os peões do outro lado
    expect(so("semaforo")).toEqual([{ onde: [5.6, -2.5], rumo: 180 }]);
    expect(so("peoes")).toEqual([{ onde: [-5.6, 2.5], rumo: 0 }]);
  });
  it("numa passadeira da ponta oposta (a SC0021), o semáforo vai para a ponta oeste e o poste de peões para a este", () => {
    const m = mobiliarioDasPassadeiras([ret("a")], new Set(["a"]), new Set(), new Set(["a"]));
    const onde = (t: string) => m.filter((x) => x.tipo === t).map((x) => ({ onde: metros(x.coord), rumo: Math.round(x.rumo) }));
    expect(onde("semaforo")).toEqual([{ onde: [-5.6, 2.5], rumo: 0 }]);
    expect(onde("peoes")).toEqual([{ onde: [5.6, -2.5], rumo: 180 }]);
  });
});

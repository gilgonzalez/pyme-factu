import { describe, expect, it } from "vitest";
import { capitalizeAddress } from "../src";

describe("capitalizeAddress", () => {
  it.each([
    ["calle de la paz 3, 2º b", "Calle de la Paz 3, 2º B"],
    ["AVENIDA DEL PUERTO 12", "Avenida del Puerto 12"],
    ["san sebastián de los reyes", "San Sebastián de los Reyes"],
    ["la rioja", "La Rioja"],
    ["  santa cruz   de tenerife ", "Santa Cruz de Tenerife"],
    ["c/ mayor s/n", "C/ Mayor S/N"],
    ["l'hospitalet de llobregat", "L'Hospitalet de Llobregat"],
    ["vitoria-gasteiz", "Vitoria-Gasteiz"],
  ])("%s → %s", (raw, expected) => {
    expect(capitalizeAddress(raw)).toBe(expected);
  });
});

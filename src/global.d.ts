// Minimaler Typ-Shim für fit-file-parser (bringt keine eigenen Typen mit).
declare module "fit-file-parser" {
  export interface FitParserOptions {
    force?: boolean;
    speedUnit?: "m/s" | "km/h" | "mph";
    lengthUnit?: "m" | "km" | "mi";
    temperatureUnit?: "celsius" | "kelvin" | "fahrenheit";
    elapsedRecordField?: boolean;
    mode?: "list" | "cascade" | "both";
  }
  export type FitCallback = (error: string | null, data: any) => void;
  export default class FitParser {
    constructor(options?: FitParserOptions);
    parse(content: ArrayBuffer | Uint8Array | Buffer, callback: FitCallback): void;
  }
}

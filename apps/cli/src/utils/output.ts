import { inspect } from "node:util";
import { wrapForDisplay } from "@loopmarshal/shared";

export const printJson = (value: unknown): void => {
  console.log(JSON.stringify(wrapForDisplay(value), null, 2));
};

export const printError = (message: string, error?: unknown): void => {
  console.error(`Error: ${message}`);
  if (error) {
    console.error(
      typeof error === "object" && error !== null
        ? inspect(error, { depth: null, colors: true })
        : String(error)
    );
  }
};

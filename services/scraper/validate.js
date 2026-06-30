import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const schemaPath = fileURLToPath(new URL("../../contracts/match.schema.json", import.meta.url));
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));

const ajv = new Ajv({ allErrors: true, useDefaults: true });
const validateFn = ajv.compile(schema);

// Throws with a readable message if `series` violates the contract. Returns series on success.
export function assertValid(series) {
  if (!validateFn(series)) {
    const errs = validateFn.errors
      .map((e) => `  ${e.instancePath || "(root)"} ${e.message}`)
      .join("\n");
    throw new Error(`match JSON violates contract:\n${errs}`);
  }
  return series;
}

export function isValid(series) {
  return validateFn(series);
}

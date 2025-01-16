import {Ajv} from 'https://cdn.jsdelivr.net/npm/ajv@8.17.1/+esm';


/**
 * Checks if a JSON Schema is valid by attempting to validate it using ajv.
 *
 * @param jsonSchema
 * @returns {Promise<{valid: *, error: (null|*)}>}
 *         - { valid: true, error: null } if it's valid
 *         - { valid: false, error: "some message" } if it's invalid
 */
async function validateJsonSchema(jsonSchema) {
    const ajv = new Ajv({allErrors: true});
    const isValid = ajv.validateSchema(jsonSchema);
    return {
        valid: isValid,
        error: isValid ? null : ajv.errorsText()
    };
}

export {validateJsonSchema};
const SchemaExample = (() => {
  /**
   * Build a representative example value for a schema. Prefers an explicit
   * `example`, falls back to `default`, then to a type-shaped placeholder
   * built from the schema's own declared properties/enum - nothing here is
   * invented data, just a rendering of what the schema already declares.
   */
  function build(spec, schema, depth = 0) {
    schema = SpecLoader.deref(spec, schema);
    if (!schema || depth > 6) return null;

    if (schema.example !== undefined) return schema.example;

    if (schema.allOf) {
      return schema.allOf.reduce((acc, sub) => {
        const val = build(spec, sub, depth + 1);
        return val && typeof val === "object" && !Array.isArray(val) ? { ...acc, ...val } : acc;
      }, {});
    }
    if (schema.oneOf) return build(spec, schema.oneOf[0], depth + 1);
    if (schema.anyOf) return build(spec, schema.anyOf[0], depth + 1);

    if (schema.default !== undefined) return schema.default;
    if (schema.enum) return schema.enum[0];

    const type = schema.type || (schema.properties ? "object" : "string");

    if (type === "object") {
      const out = {};
      const props = schema.properties || {};
      for (const [key, propSchema] of Object.entries(props)) {
        out[key] = build(spec, propSchema, depth + 1);
      }
      if (!Object.keys(props).length && schema.additionalProperties && typeof schema.additionalProperties === "object") {
        return {};
      }
      return out;
    }
    if (type === "array") {
      const item = build(spec, schema.items, depth + 1);
      return item === undefined ? [] : [item];
    }
    if (type === "integer" || type === "number") return schema.minimum ?? 0;
    if (type === "boolean") return false;
    // string
    if (schema.format === "date-time") return new Date().toISOString();
    return "string";
  }

  /**
   * Example for a whole response object (as shown in "Example response").
   * statusCode lets us drop fields the API only actually sends on certain
   * statuses - e.g. `request_id` on the shared Error schema is documented
   * as "present on 500 responses" only, so non-5xx examples shouldn't show it.
   */
  function forResponse(spec, responseObj, statusCode) {
    responseObj = SpecLoader.deref(spec, responseObj);
    const content = responseObj?.content?.["application/json"];
    if (!content) return null;
    const example = content.example !== undefined ? content.example : build(spec, content.schema);
    if (example && typeof example === "object" && !Array.isArray(example) && "request_id" in example) {
      if (!statusCode || !statusCode.startsWith("5")) {
        const { request_id, ...rest } = example;
        return rest;
      }
    }
    return example;
  }

  function forRequestBody(spec, requestBody) {
    const content = requestBody?.content?.["application/json"];
    if (!content) return null;
    if (content.example !== undefined) return content.example;
    return build(spec, content.schema);
  }

  /** Minimal, dependency-free JSON syntax highlighter -> HTML string. */
  function highlight(value) {
    const json = JSON.stringify(value, null, 2) ?? "null";
    const escaped = json.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    return escaped.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(\.\d+)?([eE][+-]?\d+)?)/g,
      (match) => {
        let cls = "tok-num";
        if (/^"/.test(match)) cls = /:$/.test(match) ? "tok-key" : "tok-str";
        else if (/true|false/.test(match)) cls = "tok-bool";
        else if (/null/.test(match)) cls = "tok-null";
        return `<span class="${cls}">${match}</span>`;
      }
    );
  }

  return { build, forResponse, forRequestBody, highlight };
})();

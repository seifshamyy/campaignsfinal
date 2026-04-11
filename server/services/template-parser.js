/**
 * Parses a Meta template's components array into a paramSchema
 * that describes every dynamic parameter needed per recipient row.
 */
export function parseTemplateToSchema(components) {
  const schema = {
    columns: [],
    componentsMap: [],
  };

  // Phone number is always the first column
  schema.columns.push({
    key: "phone_number",
    label: "Phone Number",
    description: "Recipient phone number with country code",
    example: "966501234567",
    required: true,
  });

  for (const component of components) {
    if (component.type === "HEADER") {
      if (component.format === "TEXT" && component.text?.includes("{{")) {
        const vars = component.text.match(/\{\{\d+\}\}/g) || [];
        for (let i = 1; i <= vars.length; i++) {
          schema.columns.push({
            key: `header_${i}`,
            label: `Header Variable ${i}`,
            description: `Replaces {{${i}}} in header: "${component.text}"`,
            example: component.example?.header_text?.[i - 1] || `header_value_${i}`,
            required: true,
            componentType: "header",
            paramIndex: i - 1,
          });
        }
      } else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(component.format)) {
        // If the template was created with a static media file (header_handle),
        // the image is baked into the template — no URL parameter is needed when sending.
        const isStaticMedia = Array.isArray(component.example?.header_handle) &&
          component.example.header_handle.length > 0;

        const ext =
          component.format === "IMAGE"
            ? "jpg"
            : component.format === "VIDEO"
            ? "mp4"
            : "pdf";
        schema.columns.push({
          key: "header_media_url",
          label: `Header ${component.format} URL`,
          description: isStaticMedia
            ? `Optional: override the template's default ${component.format.toLowerCase()} with a custom URL`
            : `Public URL to the ${component.format.toLowerCase()} file`,
          example: `https://example.com/file.${ext}`,
          required: !isStaticMedia, // static = not required
          isStaticMedia,
          componentType: "header",
          mediaType: component.format.toLowerCase(),
        });
        if (component.format === "DOCUMENT") {
          schema.columns.push({
            key: "header_document_filename",
            label: "Document Filename",
            description: "Display name for the document",
            example: "Invoice.pdf",
            required: false,
            componentType: "header",
            isFilename: true,
          });
        }
      }
    }

    if (component.type === "BODY") {
      const vars = component.text?.match(/\{\{\d+\}\}/g) || [];
      const preview =
        component.text?.length > 80
          ? component.text.slice(0, 77) + "..."
          : component.text || "";
      for (let i = 1; i <= vars.length; i++) {
        schema.columns.push({
          key: `body_${i}`,
          label: `Body Variable ${i}`,
          description: `Replaces {{${i}}} in body: "${preview}"`,
          example:
            component.example?.body_text?.[0]?.[i - 1] || `value_${i}`,
          required: true,
          componentType: "body",
          paramIndex: i - 1,
        });
      }
    }

    if (component.type === "BUTTONS") {
      (component.buttons || []).forEach((button, index) => {
        if (button.type === "URL" && button.url?.includes("{{1}}")) {
          schema.columns.push({
            key: `button_${index}_url_suffix`,
            label: `Button "${button.text}" URL Suffix`,
            description: `Dynamic part of button URL: ${button.url}`,
            example: "abc123",
            required: true,
            componentType: "button",
            subType: "url",
            buttonIndex: index,
          });
        }
        if (button.type === "COPY_CODE") {
          schema.columns.push({
            key: `button_${index}_code`,
            label: `Button "${button.text}" Code`,
            description: "Coupon/copy code for this button",
            example: "SAVE20",
            required: true,
            componentType: "button",
            subType: "copy_code",
            buttonIndex: index,
          });
        }
      });
    }
  }

  return schema;
}

/**
 * Extract display fields from a template's components.
 */
export function extractTemplateFields(components) {
  const result = {
    bodyText: null,
    headerType: null,
    headerText: null,
    footerText: null,
    buttonTypes: [],
  };

  for (const c of components) {
    if (c.type === "HEADER") {
      result.headerType = c.format || null;
      if (c.format === "TEXT") result.headerText = c.text || null;
    }
    if (c.type === "BODY") result.bodyText = c.text || null;
    if (c.type === "FOOTER") result.footerText = c.text || null;
    if (c.type === "BUTTONS") {
      result.buttonTypes = (c.buttons || []).map((b) => b.type);
    }
  }

  return result;
}

/**
 * Build the Meta API payload for a single recipient row.
 */
export function buildMetaPayload(template, rowData, paramSchema) {
  const components = [];

  const headerParams = paramSchema.columns.filter(
    (c) => c.componentType === "header"
  );
  const bodyParams = paramSchema.columns.filter(
    (c) => c.componentType === "body"
  );
  const buttonParams = paramSchema.columns.filter(
    (c) => c.componentType === "button"
  );

  // Header component
  if (headerParams.length > 0) {
    const first = headerParams[0];
    if (first.mediaType) {
      // Only include the header component if a media URL is actually provided.
      // Static image templates (image baked into the template) must NOT have
      // a header component in the send payload — Meta uses the embedded image.
      const mediaUrl = rowData[first.key];
      if (mediaUrl) {
        const mediaObj = { link: mediaUrl };
        if (first.mediaType === "document") {
          const fnCol = headerParams.find((c) => c.isFilename);
          if (fnCol && rowData[fnCol.key]) mediaObj.filename = rowData[fnCol.key];
        }
        components.push({
          type: "header",
          parameters: [{ type: first.mediaType, [first.mediaType]: mediaObj }],
        });
      }
      // If no URL provided (static template), skip the header component entirely.
    } else {
      components.push({
        type: "header",
        parameters: headerParams
          .filter((c) => !c.isFilename)
          .sort((a, b) => a.paramIndex - b.paramIndex)
          .map((col) => ({ type: "text", text: String(rowData[col.key] || "") })),
      });
    }
  }

  // Body component
  if (bodyParams.length > 0) {
    components.push({
      type: "body",
      parameters: bodyParams
        .sort((a, b) => a.paramIndex - b.paramIndex)
        .map((col) => ({ type: "text", text: String(rowData[col.key] || "") })),
    });
  }

  // Button components (dynamic)
  const buttonsByIndex = {};
  buttonParams.forEach((col) => {
    buttonsByIndex[col.buttonIndex] = col;
  });

  Object.entries(buttonsByIndex).forEach(([index, col]) => {
    if (col.subType === "url") {
      components.push({
        type: "button",
        sub_type: "url",
        index: String(index),
        parameters: [{ type: "text", text: String(rowData[col.key] || "") }],
      });
    } else if (col.subType === "copy_code") {
      components.push({
        type: "button",
        sub_type: "copy_code",
        index: String(index),
        parameters: [
          {
            type: "coupon_code",
            coupon_code: String(rowData[col.key] || ""),
          },
        ],
      });
    }
  });

  // Flow buttons (static — from template definition)
  const templateButtons = template.components.find((c) => c.type === "BUTTONS");
  if (templateButtons) {
    (templateButtons.buttons || []).forEach((button, index) => {
      if (button.type === "FLOW" && !buttonsByIndex[index]) {
        components.push({
          type: "button",
          sub_type: "flow",
          index: String(index),
          parameters: [
            {
              type: "action",
              action: {
                flow_token: "unused",
                flow_action_data: {
                  screen: button.navigate_screen || "WELCOME",
                },
              },
            },
          ],
        });
      }
    });
  }

  return {
    messaging_product: "whatsapp",
    to: rowData.phone_number,
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language },
      ...(components.length > 0 ? { components } : {}),
    },
  };
}

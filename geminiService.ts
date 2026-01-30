
export async function analyzeImageColors(base64Image: string) {
  try {
    const resp = await fetch("/api/utils/analyze-color", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ imageBase64: base64Image }),
    });

    if (!resp.ok) {
      throw new Error(`analyze-image failed with status ${resp.status}`);
    }

    const data = await resp.json();
    return data;
  } catch (error) {
    console.error("Gemini color extraction failed via backend:", error);
    return { hexColor: "#2563EB", iconName: "star" };
  }
}

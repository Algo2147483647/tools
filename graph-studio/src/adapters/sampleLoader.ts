export async function loadDefaultSample(fileName = "example.json"): Promise<unknown> {
  const response = await fetch(fileName, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${fileName} (${response.status}).`);
  }
  return response.json();
}

import { getSettings, patchSettings } from "./db";

export const DEFAULT_COACH_MODEL = "claude-sonnet-5";
export const COACH_MODELS = ["claude-sonnet-5", "claude-opus-5"];

export async function getApiKey(): Promise<string | undefined> {
  return (await getSettings()).anthropicApiKey;
}

export async function setApiKey(key: string | undefined): Promise<void> {
  await patchSettings({ anthropicApiKey: key?.trim() || undefined });
}

export async function getCoachModel(): Promise<string> {
  return (await getSettings()).coachModel || DEFAULT_COACH_MODEL;
}

export async function setCoachModel(model: string): Promise<void> {
  await patchSettings({ coachModel: model });
}

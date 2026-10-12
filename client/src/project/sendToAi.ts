import { api } from "../api";
import type { Project } from "../types";

/** Upload a rendered 3D view as the project's room photo so the AI can redesign it photo-realistically. */
export async function sendViewToAi(projectId: string, capture: (() => string) | null): Promise<Project> {
  if (!capture) throw new Error("The 3D view isn't ready yet");
  const dataUrl = capture();
  const blob = await (await fetch(dataUrl)).blob();
  const fd = new FormData();
  fd.append("photo", blob, "vistora-3d-view.jpg");
  return (await api.post<{ project: Project }>(`/projects/${projectId}/photo`, fd)).project;
}

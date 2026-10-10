import type { Comment, Design, Project, ShoppingItem } from "../types";

export interface ProjectBundle {
  project: Project;
  designs: Design[];
  comments: Comment[];
  shopping: ShoppingItem[];
}

export interface TabProps {
  bundle: ProjectBundle;
  setBundle: (fn: (b: ProjectBundle) => ProjectBundle) => void;
  save: (patch: Partial<Project>) => Promise<void>;
  reload: () => Promise<void>;
  goTo: (tab: string) => void;
}

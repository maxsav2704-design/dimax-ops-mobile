import * as home from "./home-fixtures";
import * as issues from "./issues-fixtures";
import * as queue from "./sync-queue-fixtures";
const repository = () => window.location.pathname.endsWith("/sync-queue.html") ? queue : window.location.pathname.endsWith("/issues.html") ? issues : home;
export const getProject = queue.getProject;
export const listProjectAddonTypes = queue.listProjectAddonTypes;
export const listProjects = () => repository().listProjects();
export const listProjectDoors = (id: string) => repository().listProjectDoors(id);
export const listProjectIssues = (id: string) => repository().listProjectIssues(id);

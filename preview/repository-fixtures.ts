import * as home from "./home-fixtures";
import * as issues from "./issues-fixtures";
const repository = () => window.location.pathname.endsWith("/issues.html") ? issues : home;
export const listProjects = () => repository().listProjects();
export const listProjectDoors = (id: string) => repository().listProjectDoors(id);
export const listProjectIssues = (id: string) => repository().listProjectIssues(id);

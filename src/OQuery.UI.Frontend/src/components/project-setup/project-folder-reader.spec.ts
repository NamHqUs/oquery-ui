import { describe, expect, it } from "vitest";
import { readProjectFolder, type FolderHandle } from "./project-folder-reader";

type FakeFolder = FolderHandle & { files: Record<string, string>; dirs: Record<string, FakeFolder> };

function fakeFolder(files: Record<string, string> = {}, dirs: Record<string, FakeFolder> = {}): FakeFolder {
  return {
    name: "project",
    files,
    dirs,
    async *values() {
      for (const name of Object.keys(files)) yield { kind: "file" as const, name };
      for (const name of Object.keys(dirs)) yield { kind: "directory" as const, name };
    },
    async getFileHandle(name: string) {
      if (!(name in files)) throw new DOMException(name, "NotFoundError");
      return { getFile: async () => new File([files[name]], name) };
    },
    async getDirectoryHandle(name: string) {
      if (!(name in dirs)) throw new DOMException(name, "NotFoundError");
      return dirs[name];
    },
  };
}

describe("readProjectFolder", () => {
  it("reads the project, its domains, saved queries and the playgrounds of each domain", async () => {
    const folder = fakeFolder(
      { "project.json": JSON.stringify({ Id: "abc123", Name: "Sales" }) },
      {
        domains: fakeFolder({ "main.json": JSON.stringify({ Id: "main", Name: "Main", Entities: [], Relations: [] }) }),
        queries: fakeFolder({ "q1.json": JSON.stringify({ id: "q1" }) }),
        main: fakeFolder({}, { playground: fakeFolder({ "p1.json": JSON.stringify({ Id: "p1", DomainId: "main" }) }) }),
      },
    );

    const bundle = await readProjectFolder(folder);

    expect(bundle.project).toEqual({ Id: "abc123", Name: "Sales" });
    expect(bundle.domains.map((domain) => domain.Id)).toEqual(["main"]);
    expect(bundle.queries).toEqual([{ id: "q1" }]);
    expect(bundle.playgrounds).toEqual([{ Id: "p1", DomainId: "main" }]);
  });

  it("rejects a legacy domain file that still carries a FullDomain", async () => {
    const folder = fakeFolder(
      { "project.json": "{}" },
      { domains: fakeFolder({ "main.json": JSON.stringify({ Id: "main", FullDomain: { Entities: [] } }) }) },
    );

    await expect(readProjectFolder(folder)).rejects.toThrow("legacy format");
  });
});

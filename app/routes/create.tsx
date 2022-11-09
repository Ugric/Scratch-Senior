import Editor from "@monaco-editor/react";
import { useRef, useState, useEffect } from "react";
let asc: {
    createMemoryStream: () => any;
    main: (
        arg0: string[],
        arg1: {
            stdout: any;
            stderr: any;
            readFile: (name: string) => string | null;
            writeFile: (name: string, contents: any) => void;
            listFiles: () => never[];
        }
    ) => Promise<{ error: any; stdout: any }>;
    definitionFiles: { assembly: any };
};
import("assemblyscript/asc").then((imp) => (asc = imp));

export default function Index() {
    const [filetree, setfiletree] = useState(250);
    const [output, setoutput] = useState<string[]>([]);
    const runtime = useRef<any>(null);
    const frame = useRef<number>(0);
    const editorRef = useRef(null);
    useEffect(() => {
        const interval = setInterval(() => {
            if (runtime.current) {
                runtime.current.frame();
            }
        }, 1000 / 60);
        return () => clearInterval(interval);
    });
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "stretch",
                justifyContent: "space-between",
                flexWrap: "nowrap",
                height: "100vh",
            }}
        >
            <div
                style={{
                    width: `${filetree}px`,
                }}
                onClick={() => {
                    if (asc) {
                        setoutput([]);
                        const tsModule = "module.ts";
                        const jsModule = "module.js";
                        const textModule = `module.wat`;
                        const wasmModule = "module.wasm";

                        const stdout = asc.createMemoryStream();
                        const sources: Record<string, string> = {
                            "module.ts": (editorRef.current as any).getValue(),
                        };
                        const outputs: Record<string, any> = {};
                        const config = {
                            stdout,
                            stderr: stdout,
                            readFile: (name: string) =>
                                Object.prototype.hasOwnProperty.call(
                                    sources,
                                    name
                                )
                                    ? sources[name]
                                    : null,
                            writeFile: (name: string, contents: any) => {
                                outputs[name] = contents;
                            },
                            listFiles: () => [],
                        };
                        const options = [
                            tsModule,
                            "--textFile",
                            textModule,
                            "--outFile",
                            wasmModule,
                            "--bindings",
                            "raw",
                            "-O3",
                            "--runtime",
                            "stub",
                        ];
                        asc.main(options, config).then(
                            async ({ error, stdout }) => {
                                const bytes = (await WebAssembly.compile(
                                    outputs[wasmModule]
                                )) as BufferSource;
                                const func = outputs[jsModule]
                                    .replace(
                                        /^export async function instantiate\(/m,
                                        "async ("
                                    )
                                    .replace(") {", ", console) => {");
                                const instantiate = eval(func);
                                console.log(instantiate);
                                console.log(outputs[textModule]);
                                const exports = await instantiate(
                                    bytes,
                                    {},
                                    {
                                        log: (val: string | null) => {
                                            if (val !== null) {
                                                setoutput((outputs) =>
                                                    outputs.concat(val)
                                                );
                                                console.log("AS:", val);
                                            }
                                        },
                                    }
                                );
                                runtime.current = exports;
                                exports.init ? exports.init() : null;
                            }
                        );
                    }
                }}
            >
                {output.map((val, i) => (
                    <p key={i}>{val}</p>
                ))}
            </div>
            <div style={{ width: `calc(100% - ${filetree}px)` }}>
                <Editor
                    height="100%"
                    language={"typescript"}
                    theme="vs-dark"
                    onMount={(Editor, m) => {
                        console.log(
                            m.languages.typescript.typescriptDefaults,
                            m.languages.typescript.typescriptDefaults.addExtraLib(
                                asc.definitionFiles.assembly,
                                "assemblyscript/std/assembly/index.d.ts"
                            )
                        );
                        editorRef.current = Editor;
                    }}
                    defaultValue={`let framenum: i64 = 0

export function init(): void {
    console.log("hello, world!")
}

export function frame(): void {
    // code here
    
    framenum++
}
`}
                />
            </div>
        </div>
    );
}

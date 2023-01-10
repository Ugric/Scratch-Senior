import Editor from "@monaco-editor/react";
import { useMemo } from "react";
import { useRef, useState, useEffect } from "react";
import styled, { css } from "styled-components";
import Base64 from "~/base64";

const Container = styled.div`
    display: flex;
    flex-direction: row;
    align-items: stretch;
    justify-content: space-between;
    flex-wrap: nowrap;
    height: 100vh;
`;

const Canvas = styled.canvas`
    aspect-ratio: 1/1;
    border: 1px gray solid;
    border-radius: 10px;
`;

const Console = styled.div`
    white-space: pre-wrap;
    overflow: auto;
    font-family: "Lucida Console", "Courier New", monospace;
    background-color: black;
    color: white;
    word-break: break-all;
    height: 250px;
    border: 1px gray solid;
    border-radius: 10px;
    padding: 5px;
    min-height: 100px;
    margin: 1rem;
    & ::selection {
        background-color: white; /* Selection highight color */
        color: black; /* Optional colour change of text that is being selected */
    }
`;
const ConsoleLine = styled.div<{ color?: string }>`
    min-height: 1rem;
    color: ${(props) => props.color};
`;

const RunButton = styled.button<{ running: boolean }>`
    background-color: transparent;
    ${(props) =>
        css`
            color: ${props.running ? "red" : "green"};
            border: 1px solid ${props.running ? "red" : "green"};
        `}
    font-size: 25px;
    margin: 0rem 1rem 1rem;
    border-radius: 5px;
    cursor: pointer;
    &:active {
        ${(props) =>
            css`
                background-color: ${props.running ? "red" : "green"};
            `}
        color: white;
    }
`;

const Sidebar = styled.div<{ width: number }>`
    overflow-y: auto;
    ${(props) =>
        css`
            width: ${props.width}px;
        `}
    display: flex;
    align-content: center;
    flex-direction: column;
    justify-content: flex-start;
    align-items: stretch;
    flex-wrap: nowrap;
    padding: 1rem;
`;

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
const ascimporting = import("assemblyscript/asc").then((imp) => (asc = imp));

const builtins = `
declare function getkeys(): Array<string>

/**Access the on screen canvas*/
declare class canvas {
    /**gets the resolution of the canvas
     * 
     * [width, height]
     */
    static getResolution(): Array<i32>
    /**clears the canvas screen */
    static cls(): string
    /**draws a rectangle */
    static drawrectangle(
                                        x: number,
                                        y: number,
                                        width: number,
                                        height: number,
                                        color: string = 'black',
                                        fill: boolean = true,
                                        lineWidth: number = 1): void
    /**draws a line */
    static drawline(x1: i32, y1: i32, x2: i32, y2: i32, color: string = 'black', width: i16 = 1): void
    /**draws a line */
    static drawcircle(
                                        x: i32,
                                        y: i32,
                                        radius: i32,
                                        color: string = "black",
                                        fill: boolean = true,
                                        width: i32 = 1): void
}`;

const defaultcode = `export function init(): void {
}

export function frame(): void {
}

export function keydown(key: string): void {
}

export function keyup(key: string): void {
}

export function stop(): void {
}`;

type runtime = {
    frame?: () => void;
    init?: () => void;
    stop?: () => void;
    keydown?: (key: string) => void;
    keyup?: (key: string) => void;
};

export default function Index() {
    const [sidewidth, setsidewidth] = useState(500);
    const [output, setoutput] = useState<JSX.Element[]>([]);
    const [asm, setasm] = useState<string>("");
    const runtime = useRef<runtime | null>(null);
    const [running, setrunning] = useState<boolean>(false);
    const instanceID = useRef<number>(0);
    const consolecontainer = useRef<HTMLDivElement>(null);
    const canvasref = useRef<HTMLCanvasElement>(null);
    const ctxref = useRef<CanvasRenderingContext2D | null>(null);
    const canvasfocus = useRef<boolean>(false);
    const keys = useRef<Record<string, true>>({});
    const loadedcode = useMemo(
        () =>
            typeof window != "undefined" && location.hash
                ? Base64.decode(decodeURIComponent(location.hash.slice(1)))
                : defaultcode,
        []
    );
    const code = useRef(loadedcode);
    const codeid = useRef<number>(0);
    const compiled = useRef<null | {
        bytes: BufferSource;
        instantiate: any;
        instance: number;
        codeid: number;
    }>(null);
    useEffect(() => {
        const interval = setInterval(() => {
            if (runtime.current?.frame && canvasref.current) {
                if (!ctxref.current) {
                    const ctx = canvasref.current.getContext("2d");
                    ctxref.current = ctx;
                }
                if (ctxref.current && runtime.current?.frame) {
                    runtime.current.frame();
                }
            }
        }, 1000 / 60);
        const keyup = (e: KeyboardEvent) => {
            if (canvasfocus.current && runtime.current) {
                if (runtime.current.keyup) {
                    runtime.current.keyup(e.key);
                }
                delete keys.current[e.code];
            }
        };
        window.addEventListener("keyup", keyup);
        const keydown = (e: KeyboardEvent) => {
            if (canvasfocus.current && runtime.current) {
                if (runtime.current.keydown) {
                    runtime.current.keydown(e.key);
                }
                keys.current[e.code] = true;
            }
        };
        window.addEventListener("keydown", keydown);
        return () => {
            clearInterval(interval);
            window.removeEventListener("keyup", keyup);
            window.removeEventListener("keydown", keydown);
        };
    }, []);
    const memory = useMemo(
        () =>
            new WebAssembly.Memory({
                initial: 10,
                maximum: 100,
            }),
        []
    );
    const run = async () => {
        if (!compiled.current) return;
        const { bytes, instantiate, instance } = compiled.current;
        setoutput([]);
        keys.current = {};
        const exports: runtime = await instantiate(
            bytes,
            {
                module: {
                    canvas: {
                        cls() {
                            if (ctxref.current)
                                ctxref.current.clearRect(
                                    0,
                                    0,
                                    ctxref.current.canvas.width,
                                    ctxref.current.canvas.height
                                );
                            return "";
                        },
                        getResolution(): [number, number] {
                            return [
                                canvasref.current?.width || 500,
                                canvasref.current?.height || 500,
                            ];
                        },
                        drawrectangle(
                            x: number,
                            y: number,
                            width: number,
                            height: number,
                            color: string = "black",
                            fill: boolean = true,
                            lineWidth: number = 1
                        ) {
                            if (ctxref.current) {
                                ctxref.current.beginPath();
                                console.log(fill);
                                if (fill) {
                                    ctxref.current.fillStyle = color;
                                    ctxref.current.fillRect(
                                        x,
                                        y,
                                        width,
                                        height
                                    );
                                    ctxref.current.fillStyle = "";
                                } else {
                                    ctxref.current.strokeStyle = color;
                                    ctxref.current.lineWidth = lineWidth;
                                    ctxref.current.rect(x, y, width, height);
                                }
                                ctxref.current.stroke();
                            }
                        },

                        drawcircle(
                            x: number,
                            y: number,
                            radius: number,
                            color: string = "black",
                            fill: boolean = true,
                            width: number = 1
                        ) {
                            if (ctxref.current) {
                                ctxref.current.beginPath();
                                ctxref.current.arc(
                                    x,
                                    y,
                                    radius,
                                    0,
                                    2 * Math.PI,
                                    false
                                );
                                ctxref.current.lineWidth = width;
                                ctxref.current.strokeStyle = color;
                                ctxref.current.fillStyle = color;
                                if (fill) {
                                    return ctxref.current.fill();
                                }
                                ctxref.current.stroke();
                                ctxref.current.lineWidth = 0;
                                ctxref.current.strokeStyle = "";
                                ctxref.current.fillStyle = "";
                            }
                        },
                        drawline(
                            x1: number,
                            y1: number,
                            x2: number,
                            y2: number,
                            color: string = "black",
                            width: number = 1
                        ) {
                            if (ctxref.current) {
                                ctxref.current.strokeStyle = color;
                                ctxref.current.lineWidth = width;
                                ctxref.current.beginPath();
                                ctxref.current.moveTo(x1, y1);
                                ctxref.current.lineTo(x2, y2);
                                ctxref.current.stroke();
                                ctxref.current.strokeStyle = "";
                                ctxref.current.lineWidth = 0;
                            }
                        },
                    },
                    getkeys() {
                        return Object.keys(keys.current);
                    },
                },
                env: {
                    __memory_base: 0,
                    __table_base: 0,
                    memory,
                },
            },
            {
                log: (val: string | null) => {
                    if (instance == instanceID.current && val !== null) {
                        setoutput((outputs) =>
                            outputs.concat(
                                <ConsoleLine key={outputs.length}>
                                    {val}
                                </ConsoleLine>
                            )
                        );
                        if (
                            consolecontainer.current &&
                            consolecontainer.current.scrollTop +
                                consolecontainer.current.offsetHeight +
                                50 >=
                                consolecontainer.current.scrollHeight
                        ) {
                            setTimeout(() => {
                                if (consolecontainer.current) {
                                    consolecontainer.current.scrollTop =
                                        consolecontainer.current.scrollHeight;
                                }
                            });
                        }
                    }
                },
            }
        );
        runtime.current = exports;
        setrunning(true);
        exports.init ? exports.init() : null;
    };
    const compile = () => {
        if (asc) {
            instanceID.current++;
            const instance = instanceID.current;
            setoutput([
                <ConsoleLine color={"green"} key={0}>
                    compiling...
                </ConsoleLine>,
            ]);
            runtime.current = null;
            const tsModule = "module.ts";
            const jsModule = "module.js";
            const textModule = `module.wat`;
            const wasmModule = "module.wasm";

            const final_code = [code.current, builtins].join("\n");

            const stdout = asc.createMemoryStream();
            const sources: Record<string, string> = {
                [tsModule]: final_code,
            };
            const outputs: Record<string, any> = {};
            const config = {
                stdout,
                stderr: stdout,
                readFile: (name: string) =>
                    Object.prototype.hasOwnProperty.call(sources, name)
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
                "--importMemory",
            ];
            asc.main(options, config).then(async ({ error, stdout }) => {
                let output = stdout.toString().trim();
                if (output.length) {
                    output = ";; " + output.replace(/\n/g, "\n;; ") + "\n";
                }

                if (instance == instanceID.current && error) {
                    output += `(module\n ;; FAILURE ${error.message}\n)\n`;
                    console.error(output);
                    setoutput([
                        <div style={{ color: "red" }} key={0}>
                            {output}
                        </div>,
                    ]);
                    return;
                }
                try {
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
                    setasm(outputs[textModule]);
                    compiled.current = {
                        bytes,
                        instantiate,
                        instance,
                        codeid: codeid.current,
                    };
                    await run();
                } catch (e) {
                    console.error(e);
                    setoutput((outputs) =>
                        outputs.concat(
                            <ConsoleLine color={"red"} key={outputs.length}>
                                {String(e)}
                            </ConsoleLine>
                        )
                    );
                    runtime.current = null;
                    setrunning(false);
                }
            });
        }
    };
    return (
        <Container>
            <Sidebar width={sidewidth}>
                <RunButton
                    running={running}
                    onClick={
                        running
                            ? () => {
                                  setrunning(false);
                                  runtime.current?.stop
                                      ? runtime.current.stop()
                                      : null;
                                  runtime.current = null;
                              }
                            : codeid.current != compiled.current?.codeid
                            ? compile
                            : async () => {
                                  try {
                                      await run();
                                  } catch (e) {
                                      console.error(e);
                                      setoutput((outputs) =>
                                          outputs.concat(
                                              <ConsoleLine
                                                  color={"red"}
                                                  key={outputs.length}
                                              >
                                                  {String(e)}
                                              </ConsoleLine>
                                          )
                                      );
                                      runtime.current = null;
                                      setrunning(false);
                                  }
                              }
                    }
                >
                    {running ? "Stop" : "Run"}
                </RunButton>
                <Canvas
                    ref={canvasref}
                    width={500}
                    height={500}
                    onFocus={() => (canvasfocus.current = true)}
                    tabIndex={100}
                    onBlur={() => {
                        canvasfocus.current = false;
                        keys.current = {};
                    }}
                ></Canvas>
                <Console ref={consolecontainer}>{output.slice(-500)}</Console>
                <Console>
                    <div>{asm}</div>
                </Console>
            </Sidebar>
            <div style={{ width: `calc(100% - ${sidewidth}px)` }}>
                <Editor
                    height="100%"
                    language={"typescript"}
                    theme="vs-dark"
                    onChange={(text) => {
                        if (text !== undefined) {
                            codeid.current++;
                            location.hash = encodeURIComponent(
                                Base64.encode(text)
                            );
                            code.current = text;
                        }
                    }}
                    onMount={(_, monaco) => {
                        ascimporting.then(() =>
                            monaco.languages.typescript.typescriptDefaults.addExtraLib(
                                asc.definitionFiles.assembly,
                                "assemblyscript/std/assembly/index.d.ts"
                            )
                        );
                        monaco.languages.typescript.typescriptDefaults.addExtraLib(
                            builtins,
                            ""
                        );
                    }}
                    defaultValue={code.current}
                />
            </div>
        </Container>
    );
}

import * as core from "@actions/core";
import { ofetch } from "ofetch";
import { run } from "./run.ts";

await run(core, ofetch);

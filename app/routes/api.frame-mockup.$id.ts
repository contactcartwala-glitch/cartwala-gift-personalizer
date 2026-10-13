import {readFile} from "node:fs/promises";
import type {LoaderFunctionArgs} from "react-router";
import {defaultFrameMockups} from "../lib/frame-mockups";
export async function loader({params}:LoaderFunctionArgs){const headers={"Access-Control-Allow-Origin":"*","Cache-Control":"public,max-age=86400"};if(params.id==="manifest")return Response.json(defaultFrameMockups,{headers});if(!defaultFrameMockups.some(item=>item.id===params.id))throw new Response("Not found",{status:404});const data=await readFile(`app/data/frame-mockups/${params.id}.b64`,"utf8");return new Response(new Uint8Array(Buffer.from(data,"base64")),{headers:{...headers,"Content-Type":"image/png"}});}

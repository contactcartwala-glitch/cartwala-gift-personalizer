import type {LoaderFunctionArgs} from "react-router";
import {defaultFrameMockups} from "../lib/frame-mockups";
export async function loader({params}:LoaderFunctionArgs){const headers={"Access-Control-Allow-Origin":"*","Cache-Control":"public,max-age=3600"};if(params.id==="manifest")return Response.json(defaultFrameMockups,{headers});const item=defaultFrameMockups.find(item=>item.id===params.id);if(!item)throw new Response("Not found",{status:404});return new Response(null,{status:302,headers:{...headers,Location:item.url}});}

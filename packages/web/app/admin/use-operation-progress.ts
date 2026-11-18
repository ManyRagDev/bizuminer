"use client";
import {useEffect,useState,useRef} from 'react';
import {observeOperation,type OperationObservation} from '../../lib/operation-observer.ts';
import {progressScope} from '../../lib/operation-progress.ts';
export function useOperationProgress(tenantId:string,productIds?:string[],filter?:{category?:string;after?:string}){
  const scope=progressScope(productIds,filter),key=JSON.stringify([tenantId,scope]);
  const [value,setValue]=useState<{key:string;observation:OperationObservation}|null>(null),refresh=useRef<()=>void>(()=>{});
  useEffect(()=>{setValue(null);const subscription=observeOperation(tenantId,productIds,observation=>setValue({key,observation}),filter);
    refresh.current=subscription.refresh;return()=>{refresh.current=()=>{};subscription.unsubscribe();};
  },[key]);
  return {...(value?.key===key?value.observation:{data:null,error:false,loading:true,paused:false}),refresh:()=>refresh.current()};
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { keccak256, parseEther } from "viem";

const path = new URL("../utils/demo-bank-server.ts", import.meta.url);
const source = ts.createSourceFile("demo-bank-server.ts", readFileSync(path,"utf8"),ts.ScriptTarget.Latest,true);
const names = new Set(["safeReason","readWithBackoff","ownerTransaction","grant"]);
const actual = source.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.has(node.name?.text)).map(node=>node.getText(source).replace(/^export /,"")).join("\n");
const code = ts.transpile(actual+"\nglobalThis.subject={ownerTransaction,grant};",{target:ts.ScriptTarget.ES2022});
function subject(overrides={}) {
  const stats={broadcasts:0,waits:0,reads:0,signatures:0};
  const account={address:"0x0000000000000000000000000000000000000001"};
  const context=vm.createContext({
    Buffer,parseEther,keccak256,
    delay:async()=>{},
    bank:{address:"0x0000000000000000000000000000000000000002",abi:[]},
    encodeFunctionData:()=>"0xab",
    signer:()=>({account,wallet:{prepareTransactionRequest:async r=>r,signTransaction:async()=>{stats.signatures++;return "0x1234";}}}),
    client:{estimateGas:async()=>21000n,waitForTransactionReceipt:async()=>{stats.waits++; if(overrides.receipt) return overrides.receipt(stats);return {status:"success",blockNumber:99n};}},
    broadcast:async()=>{stats.broadcasts++;},
    faucetStatus:async()=>{stats.reads++;if(stats.reads>1)throw new Error("RPC_HTTP_429");return {claimed:false,remainingWei:parseEther("1.5").toString(),hourRemaining:60};},
  });
  vm.runInContext(code,context);
  return {api:context.subject,stats};
}
test("confirmed grant needs no second RPC state read after payment",async()=>{
  const {api,stats}=subject();
  const value=await api.grant("0x0000000000000000000000000000000000000003");
  assert.equal(value.state,"CONFIRMED");assert.equal(value.claimed,true);
  assert.equal(stats.reads,1);assert.equal(stats.broadcasts,1);assert.equal(stats.signatures,1);
});
test("receipt 429 retries reads, never repeats signing or funding",async()=>{
  const {api,stats}=subject({receipt:s=>{if(s.waits<3)throw new Error("HTTP 429");return {status:"success",blockNumber:99n};}});
  const value=await api.ownerTransaction("grant",[],parseEther(".02"));
  assert.equal(value.hash,keccak256("0x1234"));assert.equal(stats.waits,3);
  assert.equal(stats.broadcasts,1);assert.equal(stats.signatures,1);
});
test("exhausted receipt retries retain original hash for reconciliation",async()=>{
  const {api,stats}=subject({receipt:()=>{throw new Error("HTTP 429");}});
  await assert.rejects(api.ownerTransaction("grant",[]),error=>error.hash===keccak256("0x1234"));
  assert.equal(stats.waits,4);assert.equal(stats.broadcasts,1);assert.equal(stats.signatures,1);
});

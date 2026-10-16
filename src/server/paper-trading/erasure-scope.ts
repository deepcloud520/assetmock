import type { Prisma } from "@prisma/client";

// Resolve only dependencies belonging to this workspace. A session may mix user
// text and generated outputs, so clear its complete content rather than attempting
// unsafe substring removal from financial explanations.
export async function paperErasureScope(tx: Prisma.TransactionClient, workspaceId: string, accountId: string) {
  const dependencies = await tx.dataDependency.findMany({ where: { workspaceId, sourceType: "PAPER_ACCOUNT", sourceId: accountId } });
  const ownerIds = (type: string) => dependencies.filter(d => d.ownerType === type).map(d => d.ownerId);
  const [runs, proposals, messages, steps, replay] = await Promise.all([
    tx.agentRun.findMany({ where: { workspaceId, id: { in: ownerIds("AGENT_RUN") } }, select: { id: true, sessionId: true } }),
    tx.agentProposal.findMany({ where: { workspaceId, id: { in: ownerIds("AGENT_PROPOSAL") } }, select: { run: { select: { sessionId: true } } } }),
    tx.agentMessage.findMany({ where: { session: { workspaceId }, id: { in: ownerIds("AGENT_MESSAGE") } }, select: { sessionId: true } }),
    tx.agentStep.findMany({ where: { session: { workspaceId }, id: { in: ownerIds("AGENT_STEP") } }, select: { sessionId: true } }),
    tx.paperReplaySession.findFirst({ where: { workspaceId, accountId }, include: { dataset: true } }),
  ]);
  const supported = ["AGENT_RUN", "AGENT_PROPOSAL", "AGENT_SESSION", "AGENT_MESSAGE", "AGENT_STEP"];
  const unknownOwnerTypes = [...new Set(dependencies.filter(d => !supported.includes(d.ownerType)).map(d => d.ownerType))];
  // An old owner type without a parser cannot be safely scoped to one generated
  // explanation. Surface conservative workspace Agent redaction in the preview.
  const sessionIds = unknownOwnerTypes.length
    ? (await tx.agentSession.findMany({ where: { workspaceId }, select: { id: true } })).map(s => s.id)
    : [...new Set([...ownerIds("AGENT_SESSION"), ...runs.map(r => r.sessionId), ...proposals.map(p => p.run.sessionId), ...messages.map(m => m.sessionId), ...steps.map(s => s.sessionId)])];
  const sessions = await tx.agentSession.findMany({ where: { workspaceId, id: { in: sessionIds } }, select: { id: true, version: true, updatedAt: true } });
  const scopedIds = sessions.map(s => s.id);
  const [allRuns, allProposals, allMessages, allSteps, constraints] = await Promise.all([
    tx.agentRun.findMany({ where: { workspaceId, sessionId: { in: scopedIds } }, select: { id: true, updatedAt: true, status: true } }),
    tx.agentProposal.findMany({ where: { workspaceId, run: { sessionId: { in: scopedIds } } }, select: { id: true, version: true } }),
    tx.agentMessage.findMany({ where: { sessionId: { in: scopedIds } }, select: { id: true } }),
    tx.agentStep.findMany({ where: { sessionId: { in: scopedIds } }, select: { id: true } }),
    tx.agentConstraint.findMany({ where: { sessionId: { in: scopedIds } }, select: { id: true } }),
  ]);
  const linkedDataset = replay ? await tx.paperReplayDataset.findUniqueOrThrow({ where: { id: replay.datasetId }, include: { _count: { select: { sessions: true, bars: true } } } }) : null;
  return { dependencies, sessions, runIds: allRuns.map(r => r.id), runs: allRuns, proposalIds: allProposals.map(p => p.id), proposals: allProposals,
    messageIds: allMessages.map(m => m.id), stepIds: allSteps.map(s => s.id), constraintIds: constraints.map(c => c.id), unknownOwnerTypes,
    replaySessionId: replay?.id ?? null,
    removableDataset: linkedDataset && linkedDataset._count.sessions === 1 ? { id: linkedDataset.id, name: linkedDataset.name, bars: linkedDataset._count.bars } : null,
    retainedSharedDataset: linkedDataset && linkedDataset._count.sessions > 1 ? { id: linkedDataset.id, name: linkedDataset.name, otherSessions: linkedDataset._count.sessions - 1 } : null,
  };
}

import { Router } from "express";
import { z } from "zod";
import {
  characterProfileDraftSchema, characterProfileReply, characterProfileSaveSchema, characterProfileSuggestions,
  type CharacterProfileField, type CharacterProfileDraft,
} from "@ai-novel/shared/types/director/characterProfile";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import type { RunContract } from "../../../../modules/director";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { characterProfileDialoguePrompt } from "../../../../prompting/prompts/novel/character/characterProfileDialogue.prompt";
import { fieldDiscussionRouter } from "../discussion";
import { id } from "../discussion/ReviewConversation";
import { readCharacterProfile, saveCharacterProfile } from "./profile";
import { applyCharacterProfileImpact, previewCharacterProfileImpact } from "./impact";

const path = "/novels/:novelId/characters/:characterId/profile";
const address = z.object({novelId: id, characterId: id});

interface ProfileSubject extends z.infer<typeof address> {
  base: CharacterProfileDraft;
  renameBlockedReason: string | null;
}

export function directorCharacterProfileRouter() {
  const router = Router();
  router.get(path, async (req, res) => {
    const {novelId, characterId} = address.parse(req.params);
    res.json({success: true, data: (await readCharacterProfile(prisma, novelId, characterId)).workspace});
  });
  router.patch(path, async (req, res) => {
    const {novelId, characterId} = address.parse(req.params);
    res.json({success: true, data: await saveCharacterProfile(novelId, characterId, characterProfileSaveSchema.parse(req.body))});
  });
  router.post(`${path}/impact`, async (req, res) => {
    const {novelId, characterId} = address.parse(req.params);
    res.json({success: true, data: await previewCharacterProfileImpact(novelId, characterId, req.body)});
  });
  router.post(`${path}/impact/apply`, async (req, res) => {
    const {novelId, characterId} = address.parse(req.params);
    res.json({success: true, data: await applyCharacterProfileImpact(novelId, characterId, req.body)});
  });
  router.use(fieldDiscussionRouter<CharacterProfileField, ProfileSubject, z.infer<typeof address>>(path + "/conversation", address, {
    progress: "正在对照角色资料与修改要求…",
    draft: characterProfileDraftSchema, changes: characterProfileSuggestions, reply: characterProfileReply,
    async generate({novelId, characterId, renameBlockedReason}, character, context, options) {
      const otherNames = await prisma.character.findMany({
        where: {novelId, id: {not: characterId}}, select: {name: true},
      });
      return (await runStructuredPrompt({
        asset: characterProfileDialoguePrompt,
        promptInput: {...context, character, renameBlockedReason, otherNames: otherNames.map(person => person.name)},
        options,
      })).output;
    },
  },
  ({novelId, characterId}) => JSON.stringify(["director-character-profile", novelId, characterId]),
  async (db, {novelId, characterId}) => {
    const {workspace, runId} = await readCharacterProfile(db, novelId, characterId);
    const [book, run] = await Promise.all([
      db.novel.findUniqueOrThrow({where: {id: novelId}, select: {title: true, description: true}}),
      runId ? db.directorNextRun.findUnique({where: {id: runId}, select: {contractJson: true}}) : null,
    ]);
    const contract = run ? JSON.parse(run.contractJson) as RunContract : null;
    return {
      resource: {novelId, characterId, base: workspace.fields, renameBlockedReason: workspace.renameBlockedReason},
      storyInput: (contract?.launchInput?.storyInput || book.description || book.title).slice(0, 12000),
      validateSend: () => {
        if (workspace.editBlockedReason) throw new AppError(workspace.editBlockedReason, 409);
      },
      runId,
      options: {novelId, taskId: runId, stage: "character_profile", entrypoint: "director_next",
        provider: contract?.modelConfig?.route, model: contract?.modelConfig?.model, temperature: contract?.launchInput?.temperature},
    };
  }));
  return router;
}

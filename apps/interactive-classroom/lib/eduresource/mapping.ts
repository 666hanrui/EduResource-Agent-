import type {
  EduResourceClassroomImportPayload,
  EduResourceClassroomMappingInput,
  EduResourceSceneImportPayload,
} from './types';
import type { Scene } from '@/lib/types/stage';

export function mapClassroomToEduResourceImport(
  input: EduResourceClassroomMappingInput,
): EduResourceClassroomImportPayload {
  const { context, stage, scenes } = input;

  return {
    source_classroom_id: stage.id,
    resource_package_id: context.resourcePackageId,
    ...(context.studentId ? { student_id: context.studentId } : {}),
    ...(context.teacherId ? { teacher_id: context.teacherId } : {}),
    ...(context.classId ? { class_id: context.classId } : {}),
    target_knowledge_id: context.targetKnowledge.id,
    target_knowledge_name: context.targetKnowledge.name,
    ...(context.profileSnapshotId ? { profile_snapshot_id: context.profileSnapshotId } : {}),
    ...(context.difficulty ? { difficulty: context.difficulty } : {}),
    stage: {
      id: stage.id,
      name: stage.name,
      ...(stage.description ? { description: stage.description } : {}),
      metadata: {
        openmaic_created_at: stage.createdAt,
        openmaic_updated_at: stage.updatedAt,
        language_directive: stage.languageDirective,
        interactive_mode: stage.interactiveMode,
      },
    },
    scenes: scenes.map(mapScene),
    ...(context.profileSnapshot ? { profile_snapshot: context.profileSnapshot } : {}),
    ...(context.classProfileSnapshot
      ? { class_profile_snapshot: context.classProfileSnapshot }
      : {}),
  };
}

function mapScene(scene: Scene): EduResourceSceneImportPayload {
  return {
    id: scene.id,
    type: scene.type,
    title: scene.title,
    order: scene.order,
    content: toPlainRecord(scene.content),
  };
}

function toPlainRecord(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

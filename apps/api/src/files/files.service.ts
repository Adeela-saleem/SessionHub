import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { ContentStatus, FilePurpose, StoredFile } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Types a course can reasonably exchange. Everything else is refused. */
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  'text/plain', 'text/markdown', 'text/csv',
  'application/zip', 'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/**
 * Local-disk file store.
 *
 * The disk name is a random key + the original extension; the original
 * filename is stored as display metadata and never used as a path, so a
 * name like `../../etc/passwd.pdf` is inert. Downloads re-derive
 * permission from what the file is attached to — there is no public
 * static route to the uploads directory.
 */
@Injectable()
export class FilesService {
  private readonly dir = resolve(process.env.UPLOAD_DIR ?? 'uploads');

  constructor(private prisma: PrismaService) {}

  async store(
    user: AuthUser,
    file: Express.Multer.File,
    data: { purpose: FilePurpose; assignmentId?: string; submissionId?: string },
  ) {
    if (!file) throw new BadRequestException('No file supplied');
    if (file.size > MAX_FILE_BYTES) {
      throw new BadRequestException('Files are limited to 20 MB');
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(`File type ${file.mimetype} is not accepted`);
    }

    const ext = extname(file.originalname).slice(0, 12).replace(/[^.\w-]/g, '');
    const diskKey = `${randomUUID()}${ext}`;
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, diskKey), file.buffer);

    return this.prisma.storedFile.create({
      data: {
        ownerId: user.id,
        purpose: data.purpose,
        originalName: file.originalname.slice(0, 255),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        diskKey,
        assignmentId: data.assignmentId ?? null,
        submissionId: data.submissionId ?? null,
      },
      select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
    });
  }

  private async assertCanRead(user: AuthUser, file: StoredFile & {
    assignment: { courseId: string; status: ContentStatus; course: { teacherId: string | null } } | null;
    submission: { studentId: string; assignment: { course: { teacherId: string | null } } } | null;
  }) {
    if (user.role === 'ADMIN' || file.ownerId === user.id) return;

    if (file.purpose === 'ASSIGNMENT_ATTACHMENT' && file.assignment) {
      if (file.assignment.course.teacherId === user.id) return;
      // Students: only once the assignment itself is visible to them.
      const live = file.assignment.status === 'PUBLISHED'
        || file.assignment.status === 'SCHEDULED';
      if (live) {
        const enrolled = await this.prisma.enrollment.count({
          where: { courseId: file.assignment.courseId, studentId: user.id },
        });
        if (enrolled) return;
      }
    }

    if (file.purpose === 'SUBMISSION_FILE' && file.submission) {
      if (file.submission.studentId === user.id) return;
      if (file.submission.assignment.course.teacherId === user.id) return;
    }

    throw new ForbiddenException('You do not have access to this file');
  }

  async download(user: AuthUser, id: string, res: Response) {
    const file = await this.prisma.storedFile.findUnique({
      where: { id },
      include: {
        assignment: { select: { courseId: true, status: true, course: { select: { teacherId: true } } } },
        submission: { select: { studentId: true, assignment: { select: { course: { select: { teacherId: true } } } } } },
      },
    });
    if (!file) throw new NotFoundException('File not found');
    await this.assertCanRead(user, file as never);

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.sizeBytes));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    );
    createReadStream(join(this.dir, file.diskKey)).pipe(res);
  }

  /** Owner (while their submission is still editable) or admin. */
  async remove(user: AuthUser, id: string) {
    const file = await this.prisma.storedFile.findUnique({
      where: { id },
      include: { submission: { select: { status: true } } },
    });
    if (!file) throw new NotFoundException('File not found');
    if (user.role !== 'ADMIN' && file.ownerId !== user.id) {
      throw new ForbiddenException('You do not own this file');
    }
    if (file.submission && !['DRAFT', 'RETURNED'].includes(file.submission.status) && user.role !== 'ADMIN') {
      throw new ForbiddenException('This submission has already been handed in');
    }
    await this.prisma.storedFile.delete({ where: { id } });
    await unlink(join(this.dir, file.diskKey)).catch(() => undefined);
    return { ok: true };
  }
}

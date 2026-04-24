import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum AuditAction {
  REQUEST_CREATED = 'REQUEST_CREATED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SYNC_COMPLETED = 'SYNC_COMPLETED',
  REQUEST_EXPIRED = 'REQUEST_EXPIRED',
}

@Entity()
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  action: AuditAction;

  @Column({ nullable: true })
  employeeId: string;

  @Column({ nullable: true })
  timeOffRequestId: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata: any;

  @CreateDateColumn()
  timestamp: Date;
}

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum TimeOffStatus {
  REQUESTED = 'REQUESTED',
  PENDING_MANAGER_APPROVAL = 'PENDING_MANAGER_APPROVAL',
  PENDING_HCM_VALIDATION = 'PENDING_HCM_VALIDATION',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  FINALIZED = 'FINALIZED',
  EXPIRED = 'EXPIRED',
}


@Entity()
export class TimeOffRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  employeeId: string;

  @Column()
  locationId: string;

  @Column('date')
  startDate: string; // Storing as YYYY-MM-DD

  @Column('date')
  endDate: string; // Storing as YYYY-MM-DD

  @Column({
    type: 'varchar',
    default: TimeOffStatus.REQUESTED,
  })
  status: TimeOffStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

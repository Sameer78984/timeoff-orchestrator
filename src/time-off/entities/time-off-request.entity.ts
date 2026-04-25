import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum TimeOffStatus {
  PENDING_MANAGER_APPROVAL = 'PENDING_MANAGER_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
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
  startDate: string; // YYYY-MM-DD

  @Column('date')
  endDate: string; // YYYY-MM-DD

  @Column({
    type: 'varchar',
    default: TimeOffStatus.PENDING_MANAGER_APPROVAL,
  })
  status: TimeOffStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

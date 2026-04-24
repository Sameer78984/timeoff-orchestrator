import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, Unique } from 'typeorm';

@Entity()
@Unique(['employeeId', 'locationId'])
export class Balance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  employeeId: string;

  @Column()
  locationId: string;

  @Column('float')
  totalDays: number;

  @Column('float')
  usedDays: number;

  @Column('float')
  pendingDays: number;

  @Column()
  lastSyncedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

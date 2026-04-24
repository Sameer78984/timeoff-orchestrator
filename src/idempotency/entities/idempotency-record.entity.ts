import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity()
export class IdempotencyRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  key: string;

  @Column()
  requestPayloadHash: string;

  @Column({ type: 'simple-json', nullable: true })
  responseData: any;

  @CreateDateColumn()
  createdAt: Date;
}

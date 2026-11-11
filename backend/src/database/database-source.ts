import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { psqlDbConfig } from '../configs/psqlDb.config';

export const AppDataSource = new DataSource(psqlDbConfig);

import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import figlet from 'figlet';

export async function showBanner(app: INestApplication) {
  try {
    const { default: chalk } = await import('chalk');
    const { default: boxen } = await import('boxen');
    const { default: fs } = await import('fs');
    const { default: path } = await import('path');

    const dataSource = app.get(DataSource);
    const start = Date.now();
    let dbStatus = '';

    try {
      if (dataSource.isInitialized) {
        console.log();
        console.log(
          chalk.blue(
            await figlet.text(`money = time`, {
              font: '',
              horizontalLayout: 'default',
              verticalLayout: 'default',
              width: 80,
              whitespaceBreak: true,
            }),
          ),
        );

        await dataSource.query('SELECT 1');
        const latency = Date.now() - start;
        dbStatus = chalk.green(`Online (${latency}ms)`);
      } else {
        dbStatus = chalk.red('Not Initialized');
      }
    } catch {
      dbStatus = chalk.red('Error');
    }

    const port = process.env.APP_PORT ?? 8080;
    const environment = process.env.APP_ENV || 'development';

    // Read package.json for metadata
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    const content = `
   ${chalk.hex('#FFA500')('🧠 NEURAL TICKER')}
   ${chalk.hex('#762cb2')(packageJson.description + '    ')}
`;
    console.log();
    console.log(
      boxen(content, {
        padding: 0,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'yellow',
        title: `v${packageJson.version}`,
        titleAlignment: 'right',
      }),
    );

    // Extract DB Name from connection options or env
    let dbName = 'Unknown';
    if (dataSource.isInitialized) {
      dbName =
        (dataSource.options.database as string) ||
        process.env.DB_DATABASE ||
        'neural_db';
    }

    // Log details below the banner
    console.log(` ${chalk.bold('Environment:')} ${chalk.yellow(environment)}`);
    console.log(
      ` ${chalk.bold('Database:')}    ${dbStatus} [${chalk.blue(dbName)}]`,
    );
    console.log(` ${chalk.bold('Port:')}        ${chalk.green(port)}`);
    console.log(
      ` ${chalk.bold('Url:')}         ${chalk.underline.blue(`http://localhost:${port}`)}`,
    );
    console.log(
      ` ${chalk.bold('Docs:')}        ${chalk.underline.magenta(`http://localhost:${port}/api/docs`)}`,
    );
  } catch (error) {
    console.error('Failed to display banner:', error);
  }
}

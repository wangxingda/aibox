"""Exercise deployment sequencing without touching Docker or a real database."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'manage.sh'


class ManageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        (root / 'env').touch()
        (root / 'git').write_text('#!/bin/sh\nexit 0\n')
        (root / 'docker').write_text('''#!/usr/bin/env python3
import io, os, sys, tarfile
args = sys.argv[1:]
with open(os.environ['TEST_LOG'], 'a') as log:
    log.write(' '.join(args) + '\\n')
if args[:2] == ['image', 'inspect']:
    sys.exit(1)
if 'exec' in args and 'mysqldump' in ' '.join(args):
    sys.stdout.write('CREATE TABLE example (id INT);\\n')
if 'run' in args and 'tarfile' in ' '.join(args):
    with tarfile.open(fileobj=sys.stdout.buffer, mode='w|gz') as archive:
        entry = tarfile.TarInfo('uploads/')
        entry.type = tarfile.DIRTYPE
        archive.addfile(entry)
if 'app.migrate' in args and os.environ.get('FAIL_MIGRATION'):
    sys.exit(1)
''')
        for name in ('docker', 'git'):
            (root / name).chmod(0o755)
        self.root = root
        self.env = dict(os.environ, PATH=f"{root}:{os.environ['PATH']}",
                        AIBOX_ENV_FILE=str(root / 'env'), AIBOX_BACKUP_DIR=str(root / 'backups'),
                        TEST_LOG=str(root / 'calls'))

    def run_script(self, command):
        result = subprocess.run(['bash', str(SCRIPT), command], env=self.env, capture_output=True, text=True)
        calls = (self.root / 'calls').read_text().splitlines()
        return result, calls

    def test_restart_only_restarts_application_services(self):
        result, calls = self.run_script('restart')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(any(line.endswith('restart api worker frontend') for line in calls))
        self.assertFalse(any(line.endswith('restart mysql redis nginx') for line in calls))

    def test_update_backs_up_before_migration_and_starts_afterwards(self):
        result, calls = self.run_script('update')
        self.assertEqual(result.returncode, 0, result.stderr)
        stop = next(i for i, x in enumerate(calls) if x.endswith('stop worker api'))
        dump = next(i for i, x in enumerate(calls) if 'mysqldump' in x)
        archive = next(i for i, x in enumerate(calls) if 'tarfile' in x)
        migrate = next(i for i, x in enumerate(calls) if 'app.migrate' in x)
        start = next(i for i, x in enumerate(calls) if x.endswith('up -d --no-build --wait'))
        self.assertTrue(stop < dump < archive < migrate < start)
        self.assertEqual(len(list((self.root / 'backups').glob('*/mysql.sql.gz'))), 1)
        self.assertEqual(len(list((self.root / 'backups').glob('*/uploads.tar.gz'))), 1)

    def test_migration_failure_does_not_start_or_delete_images(self):
        self.env['FAIL_MIGRATION'] = '1'
        result, calls = self.run_script('update')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('数据库迁移失败', result.stderr)
        self.assertFalse(any(x.endswith('up -d --no-build --wait') for x in calls))
        self.assertFalse(any(x.startswith('image rm ') for x in calls))
        self.assertEqual(len(list((self.root / 'backups').glob('*/mysql.sql.gz'))), 1)


if __name__ == '__main__':
    unittest.main()

import os
from unittest.mock import patch

from django.test import SimpleTestCase

from routeguard.settings import database_config


class DatabaseConfigurationTests(SimpleTestCase):
    def test_database_url_decodes_uri_components(self):
        encoded = "postgresql://route%40guard:p%40ss%2Fword%3F@localhost:5432/route%20guard?sslmode=require"

        with patch.dict(os.environ, {"DATABASE_URL": encoded}):
            config = database_config()

        self.assertEqual(config["NAME"], "route guard")
        self.assertEqual(config["USER"], "route@guard")
        self.assertEqual(config["PASSWORD"], "p@ss/word?")
        self.assertEqual(config["OPTIONS"], {"sslmode": "require"})

"""
WSGI Entry Point for Render Deployment
Sets up the Python path and imports the Flask app
"""
import sys
import os

# Add the backendapi/backendapi directory to the Python path
# This is where the actual modules (integrations, workflows, etc.) live
backend_dir = os.path.join(os.path.dirname(__file__), 'backendapi', 'backendapi')
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Also add the backendapi directory for the api module
api_parent_dir = os.path.join(os.path.dirname(__file__), 'backendapi')
if api_parent_dir not in sys.path:
    sys.path.insert(0, api_parent_dir)

# Now import the Flask app from the backendapi package
from api.backend import app

# Export for gunicorn
application = app

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))

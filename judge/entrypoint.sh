#!/bin/bash
set -e

echo "Setting up isolate cgroups..."

# Create run directory for isolate
mkdir -p /run/isolate

# Check if we're using cgroups v2 (unified hierarchy)
if [ -f /sys/fs/cgroup/cgroup.controllers ]; then
    echo "Detected cgroups v2 (unified hierarchy)"
    
    # Enable controllers at root level
    echo "+cpu +memory +pids" > /sys/fs/cgroup/cgroup.subtree_control 2>/dev/null || true
    
    # Create isolate cgroup
    mkdir -p /sys/fs/cgroup/isolate
    
    # Enable controllers in isolate cgroup
    echo "+cpu +memory +pids" > /sys/fs/cgroup/isolate/cgroup.subtree_control 2>/dev/null || true
    
    # Write cgroup path to file (isolate reads path from this file)
    echo "/sys/fs/cgroup/isolate" > /run/isolate/cgroup
    
    echo "cgroups v2 setup complete"
else
    echo "Detected cgroups v1 (legacy hierarchy)"
    echo "Note: isolate 2.x requires cgroups v2 for proper cgroup support"
    echo "Running without cgroups - memory limits will use address space limiting"
    # Don't create /run/isolate/cgroup - let isolate run without cgroups
    echo "cgroups v1 detected - skipping cgroup setup"
fi

# Verify isolate is working
echo "Testing isolate..."
isolate --version

# Try to initialize a test box
if isolate --box-id=0 --cg --init > /dev/null 2>&1; then
    echo "Isolate test box initialized successfully"
    isolate --box-id=0 --cleanup > /dev/null 2>&1 || true
else
    echo "Warning: Failed to initialize isolate test box with cgroups"
    # Try without cgroups
    if isolate --box-id=0 --init > /dev/null 2>&1; then
        echo "Isolate works without cgroups (memory limits may not work)"
        isolate --box-id=0 --cleanup > /dev/null 2>&1 || true
    else
        echo "Error: Isolate initialization failed"
    fi
fi

echo "Starting judge worker..."
exec /app/judge

#!/usr/bin/env python

from fom.session import Fluid
import os
import sys

if len(sys.argv) != 2:
    print >>sys.stderr, 'Usage: %s extension-file.zip' % sys.argv[0]
    sys.exit(1)

crxFile = sys.argv[1]
data = open(crxFile).read()

fdb = Fluid('https://fluiddb.fluidinfo.com')
password = os.environ['FLUIDDB_FLUIDINFO_DOT_COM_PASSWORD']
fdb.login('fluidinfo.com', password)

about = 'tabpubsub'
tag = 'fluidinfo.com/chrome.zip'

fdb.about[about][tag].put(data, 'application/zip')

print 'Uploaded %s to https://fluiddb.fluidinfo.com/about/%s/%s' % (
    crxFile, about, tag)

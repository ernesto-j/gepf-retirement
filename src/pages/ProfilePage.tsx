import { PageHeader } from '../components/ui'
import { useAppStore } from '../store/useAppStore'
import { AboutYouSection } from '../components/profile/AboutYouSection'
import { GepfSection } from '../components/profile/GepfSection'
import { LifestyleSection } from '../components/profile/LifestyleSection'
import { AssumptionsSection } from '../components/profile/AssumptionsSection'
import ImportExport from '../components/profile/ImportExport'

export default function ProfilePage() {
  const profile = useAppStore((s) => s.profile)
  const setPerson = useAppStore((s) => s.setPerson)
  const setGepf = useAppStore((s) => s.setGepf)
  const setLifestyle = useAppStore((s) => s.setLifestyle)
  const setAssumptions = useAppStore((s) => s.setAssumptions)
  const replaceProfile = useAppStore((s) => s.replaceProfile)

  return (
    <div>
      <PageHeader
        title="Your profile"
        intro="Tell us about yourself, your GEPF membership and your desired lifestyle in retirement. Everything here feeds every other page — nothing is saved anywhere but this browser."
      />
      <AboutYouSection person={profile.person} onChange={setPerson} />
      <GepfSection profile={profile} onChange={setGepf} onReplaceProfile={replaceProfile} />
      <LifestyleSection lifestyle={profile.lifestyle} onChange={setLifestyle} />
      <AssumptionsSection assumptions={profile.assumptions} onChange={setAssumptions} />
      <ImportExport />
    </div>
  )
}
